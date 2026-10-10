@live
Feature: Live deployment
  The deployed VirtuSP service answers on its public address. These checks
  cover the contract the browser and the load balancer share: health, the
  marketing page, every workspace, a real interview, and the static files.

  Scenario: The public address is the simulator and not an error page
    Given the landing page is open
    Then the address contains "https://"
    And the address contains ".cloudfront.net"
    And the page does not show "503 Service Temporarily Unavailable"
    And the page does not show "502 Bad Gateway"
    And the page shows "Practice the difficult conversation before the patient is real."
    And the page shows "Open simulator"
    And the page shows "Denise: I take it every day, like I'm supposed to."
    And the health endpoint reports the service is up

  Scenario: A visitor can open the simulator and return home
    Given the landing page is open
    When the user follows "Open simulator"
    Then the address contains "app.html"
    And the page shows "Patient Studio"
    And the page shows "Denise Carter"
    And the page shows "Marcus Lee"
    When the user follows the brand home
    Then the page shows "Practice the difficult conversation before the patient is real."

  Scenario: Every workspace opens on the deployed app
    When the user opens the "Encounter" workspace
    Then the page shows "Start a visit"
    When the user opens the "Team" workspace
    Then the page shows "Launch a patient first."
    When the user opens the "Assessment" workspace
    Then the page shows "Complete an interview first."
    When the user opens the "Ground Truth" workspace
    Then the page shows "The ingest agent writes only claims that quote their source."
    And the page shows "shard 0"
    When the user opens the "Patient Studio" workspace
    Then the page shows "Pick a patient or create one. No code."

  Scenario: Denise answers from the deployed grounding service
    Given the student has launched "Denise Carter"
    Then the transcript shows "Hi, I'm Denise."
    And the page shows "Denise Carter, 58"
    When the student asks "What brings you in today?"
    Then the transcript shows "I've been really thirsty and tired for a few months. My doctor says it's diabetes."
    When the student asks "What dose of metformin should I prescribe?"
    Then the transcript shows "Request blocked"
    When the student opens the "Labs" chart section
    Then the page shows "eGFR"
    When the user opens the "Assessment" workspace
    Then the page shows "Explainable feedback"

  Scenario: The deployed static files and unknown paths respond correctly
    Given the landing page is open
    Then these HTTP responses match:
      | path            | status | type             |
      | /api/health     | 200    | application/json |
      | /               | 200    | text/html        |
      | /app.html       | 200    | text/html        |
      | /favicon.svg    | 200    | image/svg+xml    |
      | /img/denise.jpg | 200    | image/jpeg       |
      | /missing-page   | 404    | text/plain       |
