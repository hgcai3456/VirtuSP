# Staged JMeter run for the local VirtuSP process.
# The plans accept -Jthreads up to 100000. This host runs every stage it can
# allocate and records the rest as skipped. One Windows client has 16384
# ephemeral ports by default, and each JMeter thread keeps its own connection,
# so 100000 concurrent users needs several injectors. The visit plan stays
# small because every turn rewrites state.json. Traffic stays on 127.0.0.1
# with AI and S3 turned off.
param(
  [int]$MaxUsers = 100000,
  [string]$TargetHost = "127.0.0.1",
  [int]$Port = 3099
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

if ($TargetHost -notin @("127.0.0.1", "localhost", "::1")) {
  throw "Refusing $TargetHost. These plans load the local process only."
}
if ($MaxUsers -lt 1 -or $MaxUsers -gt 100000) {
  throw "MaxUsers must be from 1 to 100000."
}

function Get-FreeMB {
  return [int][math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)
}

function Get-TotalMB {
  return [int][math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1024)
}

function Get-PortCount {
  $text = netsh int ipv4 show dynamicport tcp | Out-String
  if ($text -match "Number of Ports\s*:\s*(\d+)") { return [int]$Matches[1] }
  return 16384
}

function Get-AvailableMB {
  try {
    return [int](Get-Counter '\Memory\Available MBytes').CounterSamples.CookedValue
  } catch {
    return Get-FreeMB
  }
}

function Test-StageFits {
  param([int]$Threads, [int]$AvailableMB, [int]$Ports)
  if ($Threads -gt ($Ports - 2048)) { return $false }
  if ($Threads -le 5 -and $AvailableMB -ge 250) { return $true }
  # 2 MB per thread, 200 MB for the JMeter process, 150 MB left for the OS.
  return ($AvailableMB - (200 + (2 * $Threads))) -ge 150
}

function Get-SkipReason {
  param([int]$Threads, [int]$AvailableMB, [int]$Ports)
  if ($Threads -gt ($Ports - 2048)) {
    return "One client has $Ports ephemeral TCP ports, so it cannot hold $Threads simultaneous connections. 100000 users needs several load generators."
  }
  return "Host limit: $AvailableMB MB available is not enough to start $Threads JMeter threads without swapping this machine."
}

function Test-AppHealth {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3
    return ($response.StatusCode -eq 200 -and $response.Content -match '"dialogue":"local"')
  } catch {
    return $false
  }
}

function Ensure-JMeter {
  $root = Join-Path $repo "tmp\jmeter"
  $install = Join-Path $root "apache-jmeter-5.6.3"
  $jar = Join-Path $install "bin\ApacheJMeter.jar"
  if (Test-Path $jar) { return $install }
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $zip = Join-Path $root "apache-jmeter-5.6.3.zip"
  $urls = @(
    "https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-5.6.3.zip",
    "https://dlcdn.apache.org/jmeter/binaries/apache-jmeter-5.6.3.zip"
  )
  $downloaded = $false
  foreach ($url in $urls) {
    try {
      Write-Host "Downloading $url"
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
      $downloaded = $true
      break
    } catch {
      Write-Host "Download failed: $($_.Exception.Message)"
    }
  }
  if (-not $downloaded) { throw "Could not download Apache JMeter 5.6.3." }
  Expand-Archive -Path $zip -DestinationPath $root -Force
  if (-not (Test-Path $jar)) { throw "ApacheJMeter.jar was not extracted." }
  return $install
}

function Invoke-JMeterPlan {
  param(
    [string]$Plan,
    [int]$Threads,
    [int]$Ramp,
    [int]$Duration,
    [string]$WorkDir,
    [string]$JMeterHome,
    [int]$FreeMB
  )
  $stageDir = Join-Path $WorkDir ("{0:D6}" -f $Threads)
  New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
  $jtl = Join-Path $stageDir "results.jtl"
  $stdout = Join-Path $stageDir "jmeter.out"
  $stderr = Join-Path $stageDir "jmeter.err"
  $heap = [math]::Min(768, [math]::Max(128, [math]::Floor(($FreeMB - 160) * 0.35)))
  $questions = ((Resolve-Path (Join-Path $repo "perf\jmeter\questions.csv")).Path) -replace "\\", "/"
  $props = (Resolve-Path (Join-Path $repo "perf\jmeter\user.properties")).Path
  $javaArgs = @(
    "-Xms64m",
    "-Xmx${heap}m",
    "-XX:MaxMetaspaceSize=128m",
    "-Duser.language=en",
    "-jar", "ApacheJMeter.jar",
    "-n",
    "-t", $Plan,
    "-l", $jtl,
    "-q", $props,
    "-Jthreads=$Threads",
    "-Jramp=$Ramp",
    "-Jduration=$Duration",
    "-Jhost=127.0.0.1",
    "-Jport=$Port",
    "-Jprofile=denise",
    "-Jquestions=$questions"
  )
  $proc = Start-Process -FilePath "java" -WorkingDirectory (Join-Path $JMeterHome "bin") `
    -ArgumentList $javaArgs -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $timeoutMs = ($Duration + 120) * 1000
  $finished = $proc.WaitForExit($timeoutMs)
  $timedOut = -not $finished
  if ($timedOut) {
    & taskkill /PID $proc.Id /T /F 2>$null | Out-Null
    $exitCode = 124
  } else {
    # Drain redirected output or ExitCode stays null.
    $null = $proc.WaitForExit()
    $proc.Refresh()
    $exitCode = $proc.ExitCode
    if ($null -eq $exitCode) { $exitCode = 0 }
  }
  $summary = $null
  if (Test-Path $jtl) {
    $json = & node (Join-Path $repo "perf\summarize-jtl.js") $jtl
    if ($LASTEXITCODE -eq 0 -and $json) {
      $summary = $json | ConvertFrom-Json
    }
  }
  return [pscustomobject]@{
    threads  = $Threads
    ramp     = $Ramp
    duration = $Duration
    exitCode = $exitCode
    timedOut = $timedOut
    heapMb   = $heap
    jtl      = $jtl
    summary  = $summary
  }
}

$freeAtStart = Get-FreeMB
$availableAtStart = Get-AvailableMB
$totalMb = Get-TotalMB
$ports = Get-PortCount
$ceiling = 0
foreach ($candidate in @(5, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000)) {
  if ($candidate -le $MaxUsers -and (Test-StageFits -Threads $candidate -AvailableMB $availableAtStart -Ports $ports)) {
    $ceiling = $candidate
  }
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $repo "output\perf\$stamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
Write-Output "Available memory ${availableAtStart} MB (${freeAtStart} MB free) of ${totalMb} MB. Ephemeral ports: $ports. Largest stage that fits now: $ceiling."

$jmeterHome = Ensure-JMeter
$server = $null
$stages = @()
$visit = $null
$stopReason = $null

try {
  $dataDir = Join-Path $repo "tmp\perf-data"
  if (Test-Path $dataDir) { Remove-Item -Recurse -Force $dataDir }
  $env:AI_ENABLED = "false"
  $env:S3_BUCKET = ""
  $env:AWS_IMAGES_ENABLED = "false"
  $env:PORT = "$Port"
  $env:HOST = "127.0.0.1"
  $env:VIRTUSP_DATA_DIR = "tmp/perf-data"
  $serverLog = Join-Path $runDir "server.out"
  $serverErr = Join-Path $runDir "server.err"
  $server = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $repo `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-AppHealth) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Local server did not become ready on port $Port with dialogue=local." }
  Write-Output "Server ready at http://127.0.0.1:$Port (local engine, S3 off)."

  $planned = @(5, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000) |
    Where-Object { $_ -le $MaxUsers }
  $climbing = $true
  $blockedByHost = $false
  $blockedAvailable = 0
  foreach ($threads in $planned) {
    if (-not $climbing) {
      $stages += [pscustomobject]@{
        plan = "student-session"
        threads = $threads
        status = "skipped"
        reason = $(if ($blockedByHost) { (Get-SkipReason -Threads $threads -AvailableMB $blockedAvailable -Ports $ports) } else { "Not attempted at $threads users. $stopReason" })
      }
      continue
    }
    $availableNow = Get-AvailableMB
    if (-not (Test-StageFits -Threads $threads -AvailableMB $availableNow -Ports $ports)) {
      Write-Output "Available memory is $availableNow MB. Waiting 10s before deciding on $threads users."
      Start-Sleep -Seconds 10
      $availableNow = Get-AvailableMB
    }
    if (-not (Test-StageFits -Threads $threads -AvailableMB $availableNow -Ports $ports)) {
      $blockedByHost = $true
      $blockedAvailable = $availableNow
      $climbing = $false
      $hostReason = Get-SkipReason -Threads $threads -AvailableMB $availableNow -Ports $ports
      if (-not $stopReason) { $stopReason = $hostReason }
      $stages += [pscustomobject]@{
        plan = "student-session"; threads = $threads; status = "skipped"; reason = $hostReason
      }
      continue
    }
    $freeNow = $availableNow
    $ramp = [math]::Min(60, [math]::Max(2, [math]::Ceiling($threads / 25)))
    $duration = $ramp + 15
    Write-Output "Running student session: $threads users, ramp ${ramp}s, duration ${duration}s."
    $result = Invoke-JMeterPlan -Plan (Join-Path $repo "perf\jmeter\student-session.jmx") `
      -Threads $threads -Ramp $ramp -Duration $duration -WorkDir (Join-Path $runDir "read") `
      -JMeterHome $jmeterHome -FreeMB $freeNow
    $stats = $result.summary
    $healthy = Test-AppHealth
    $samples = if ($stats) { [int]$stats.samples } else { 0 }
    $errorPct = if ($stats) { [double]$stats.errorPct } else { 100 }
    $p95 = if ($stats -and $null -ne $stats.p95Ms) { [int]$stats.p95Ms } else { 999999 }
    $passed = ($result.exitCode -eq 0) -and (-not $result.timedOut) -and $healthy -and ($samples -ge $threads) -and ($errorPct -le 2) -and ($p95 -lt 3000)
    $status = if ($passed) { "passed" } else { "failed" }
    $reason = $null
    if (-not $passed) {
      $reason = "exit=$($result.exitCode) timeout=$($result.timedOut) health=$healthy samples=$samples errorPct=$errorPct p95Ms=$p95"
      $stopReason = "Stopped after $threads users: $reason"
      $climbing = $false
    }
    $stages += [pscustomobject]@{
      plan     = "student-session"
      threads  = $threads
      status   = $status
      reason   = $reason
      exitCode = $result.exitCode
      samples  = $samples
      errorPct = $errorPct
      rps      = if ($stats) { $stats.rps } else { 0 }
      meanMs   = if ($stats) { $stats.meanMs } else { $null }
      p50Ms    = if ($stats) { $stats.p50Ms } else { $null }
      p95Ms    = if ($stats) { $stats.p95Ms } else { $null }
      p99Ms    = if ($stats) { $stats.p99Ms } else { $null }
      maxMs    = if ($stats) { $stats.maxMs } else { $null }
      labels   = if ($stats) { $stats.labels } else { @() }
    }
  }

  if (Test-AppHealth) {
    $visitUsers = 5
    if (Test-StageFits -Threads 10 -AvailableMB (Get-AvailableMB) -Ports $ports) { $visitUsers = 10 }
    if ($visitUsers -ge 1) {
      Write-Output "Running local visit: $visitUsers users, 1 encounter and 3 questions each."
      $result = Invoke-JMeterPlan -Plan (Join-Path $repo "perf\jmeter\visit-turn.jmx") `
        -Threads $visitUsers -Ramp 2 -Duration 90 -WorkDir (Join-Path $runDir "visit") `
        -JMeterHome $jmeterHome -FreeMB (Get-FreeMB)
      $stats = $result.summary
      $samples = if ($stats) { [int]$stats.samples } else { 0 }
      $errorPct = if ($stats) { [double]$stats.errorPct } else { 100 }
      $expected = $visitUsers * 4
      $passed = ($result.exitCode -eq 0) -and (-not $result.timedOut) -and (Test-AppHealth) -and ($samples -ge $expected) -and ($errorPct -le 2)
      $visit = [pscustomobject]@{
        plan     = "visit-turn"
        threads  = $visitUsers
        status   = $(if ($passed) { "passed" } else { "failed" })
        samples  = $samples
        errorPct = $errorPct
        rps      = if ($stats) { $stats.rps } else { 0 }
        meanMs   = if ($stats) { $stats.meanMs } else { $null }
        p50Ms    = if ($stats) { $stats.p50Ms } else { $null }
        p95Ms    = if ($stats) { $stats.p95Ms } else { $null }
        p99Ms    = if ($stats) { $stats.p99Ms } else { $null }
        labels   = if ($stats) { $stats.labels } else { @() }
        note     = "Capped at 10 users. Each turn persists the whole store, so this plan is not scaled to 100000."
      }
    }
  }
} catch {
  $stopReason = $_.Exception.Message
  Write-Output "RUN FAILED: $stopReason"
} finally {
  if ($server -and -not $server.HasExited) {
    & taskkill /PID $server.Id /T /F 2>$null | Out-Null
  }
}

$passedStages = @($stages | Where-Object { $_.status -eq "passed" })
$maxStable = 0
if ($passedStages.Count -gt 0) {
  $maxStable = ($passedStages | Measure-Object -Property threads -Maximum).Maximum
}
$attempted = @($stages | Where-Object { $_.status -in @("passed", "failed") })
$highestAttempted = 0
if ($attempted.Count -gt 0) {
  $highestAttempted = ($attempted | Measure-Object -Property threads -Maximum).Maximum
}
$stage100 = $stages | Where-Object { $_.threads -eq 100000 } | Select-Object -First 1
$report = [pscustomobject]@{
  targetUsers            = 100000
  requestedMaxUsers      = $MaxUsers
  freeMbAtStart          = $freeAtStart
  availableMbAtStart     = $availableAtStart
  totalMb                = $totalMb
  ephemeralPorts         = $ports
  threadCeilingAtStart   = $ceiling
  server                 = "http://127.0.0.1:$Port"
  engine                 = "local"
  maxStableUsers         = $maxStable
  highestAttemptedUsers  = $highestAttempted
  users100kExecuted      = [bool]($stage100 -and $stage100.status -in @("passed", "failed"))
  users100kStatus        = if ($stage100) { $stage100.status } else { "not-in-plan" }
  users100kReason        = if ($stage100) { $stage100.reason } else { $null }
  stopReason             = $stopReason
  stages                 = $stages
  visit                  = $visit
  results                = $runDir
}
$summaryPath = Join-Path $runDir "summary.json"
$latestPath = Join-Path $repo "output\perf\latest-summary.json"
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryPath -Encoding utf8
New-Item -ItemType Directory -Force -Path (Split-Path $latestPath) | Out-Null
Copy-Item $summaryPath $latestPath -Force
Write-Output "SUMMARY $summaryPath"
$report | ConvertTo-Json -Depth 6
if ($highestAttempted -lt 1 -and (-not $visit -or $visit.status -ne "passed")) { exit 1 }
