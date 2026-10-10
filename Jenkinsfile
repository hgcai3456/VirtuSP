// VirtuSP CI/CD.
//
// The agent needs Node.js 22 (the same major as the Dockerfile) and npm.
// Regression launches headless Chrome through Selenium. Install Google Chrome
// or Chromium on the agent, or set CHROME_PATH to the binary. Selenium Manager
// downloads a matching ChromeDriver on the first run.
//
// The image is built on main. Deploy runs only on main, and only when the
// AWS_DEPLOY_ENABLED job environment variable is true or the DEPLOY parameter
// is checked. That agent also needs Docker, the AWS CLI, Terraform, and
// credentials that can push to ECR and update ECS. infra/aws/scripts/deploy.sh
// (or deploy.ps1 on Windows) reads the Terraform outputs and rolls the service.
//
// Live regression then opens the public load balancer in headless Chrome.
// Set VIRTUSP_URL on the job to target a different address. The agent needs
// outbound HTTP to that host.
//
// Performance runs the JMeter plans in perf/jmeter against the loopback server.
// The agent needs Java and PowerShell. The stage fails unless a read-only
// session and the local visit both pass. Larger thread counts, up to 100000,
// run only when the agent can allocate them. The plans stay on 127.0.0.1 and
// do not call Bedrock.

@NonCPS
def isMainBranch() {
    def name = (env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').replaceFirst(/^origin\//, '')

    return name == 'main' || name == 'master'
}

def runCmd(String command) {
    if (isUnix()) {
        sh command
    } else {
        bat command
    }
}

pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'DEPLOY',
            defaultValue: false,
            description: 'After the tests pass, build, push, and roll the ECS service. Main branch only.'
        )
    }

    options {
        timestamps()
        timeout(time: 120, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
    }

    environment {
        CI = 'true'
        TZ = 'UTC'
        LANG = 'en_US.UTF-8'
        LC_ALL = 'en_US.UTF-8'
        E2E_HEADLESS = '1'
        E2E_LOCALE = 'en-US'
        E2E_TIMEZONE = 'UTC'
    }

    stages {
        stage('Install') {
            steps {
                script {
                    runCmd('node -v')
                    runCmd('npm -v')
                    runCmd('node -e "const major=Number(process.versions.node.split(\'.\')[0]); if (major<22) { console.error(\'VirtuSP CI requires Node.js 22 or newer. Found \'+process.version); process.exit(1) }"')
                    runCmd('npm ci --ignore-scripts')
                }
            }
        }

        stage('Unit tests') {
            options {
                timeout(time: 20, unit: 'MINUTES')
            }
            steps {
                script {
                    runCmd('node -e "require(\'fs\').mkdirSync(\'reports/junit\',{recursive:true}); require(\'fs\').mkdirSync(\'reports/coverage\',{recursive:true})"')
                    // Scope discovery to test/ so the integration suite and Cucumber files stay in their own stages.
                    runCmd('npm test -- --test-reporter=spec --test-reporter=junit --test-reporter=lcov --test-reporter-destination=stdout --test-reporter-destination=reports/junit/unit.xml --test-reporter-destination=reports/coverage/lcov.info test')
                }
            }
        }

        stage('Integration tests') {
            options {
                timeout(time: 20, unit: 'MINUTES')
            }
            steps {
                script {
                    runCmd('node -e "require(\'fs\').mkdirSync(\'reports/junit\',{recursive:true})"')
                    runCmd('npm run test:integration -- --test-reporter=spec --test-reporter=junit --test-reporter-destination=stdout --test-reporter-destination=reports/junit/integration.xml')
                }
            }
        }

        stage('Performance tests') {
            options {
                timeout(time: 30, unit: 'MINUTES')
            }
            steps {
                script {
                    // Local engine only. The runner refuses any host other than loopback.
                    runCmd('npm run perf:ci')
                }
            }
        }

        stage('Regression tests') {
            options {
                timeout(time: 45, unit: 'MINUTES')
            }
            steps {
                script {
                    runCmd('node -e "const binary=require(\'./tests/e2e/support/chrome\').chromeBinary(); if (!binary) { console.error(\'Install Google Chrome or Chromium, or set CHROME_PATH.\'); process.exit(1) } console.log(\'Chrome: \'+binary)"')
                    // Unit cases already ran above. This pass is the browser suite, including the @regression feature.
                    runCmd('npm run test:regression -- --only e2e')
                }
            }
        }

        stage('Build image') {
            when {
                expression { return isMainBranch() }
            }
            steps {
                script {
                    def tag = env.GIT_COMMIT ?: env.BUILD_NUMBER
                    def dockerOk = isUnix()
                        ? sh(script: 'command -v docker >/dev/null 2>&1', returnStatus: true) == 0
                        : bat(script: 'where docker >NUL 2>&1', returnStatus: true) == 0
                    if (!dockerOk) {
                        error('Docker is required to build the VirtuSP image on the main branch.')
                    }
                    runCmd("docker build -t virtusp:${tag} .")
                }
            }
        }

        stage('Deploy') {
            when {
                allOf {
                    expression { return isMainBranch() }
                    expression { return params.DEPLOY == true || env.AWS_DEPLOY_ENABLED == 'true' }
                }
            }
            steps {
                script {
                    if (isUnix()) {
                        sh 'sh infra/aws/scripts/deploy.sh'
                    } else {
                        bat 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\infra\\aws\\scripts\\deploy.ps1'
                    }
                }
            }
        }

        stage('Live regression') {
            options {
                timeout(time: 25, unit: 'MINUTES')
            }
            steps {
                script {
                    runCmd('node -e "const binary=require(\'./tests/e2e/support/chrome\').chromeBinary(); if (!binary) { console.error(\'Install Google Chrome or Chromium, or set CHROME_PATH.\'); process.exit(1) } console.log(\'Chrome: \'+binary)"')
                    // Runs after Deploy. A skipped deploy still reaches this stage, so it checks the service that is already public.
                    runCmd('npm run test:live -- --attempts 2')
                }
            }
        }
    }

    post {
        always {
            junit testResults: 'reports/junit/*.xml', allowEmptyResults: true
            archiveArtifacts artifacts: 'reports/junit/*.xml,reports/coverage/lcov.info,reports/perf/**,tests/e2e/reports/**,data/prompts-tested.csv,data/e2e-server.log', allowEmptyArchive: true
        }
    }
}
