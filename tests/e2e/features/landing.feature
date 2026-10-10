@live
Feature: Landing page
  A visitor can understand VirtuSP and open the simulator without signing in.

  Scenario: The marketing page explains the product
    Given the landing page is open
    Then the page shows "VirtuSP"
    And the page shows "Practice the difficult conversation before the patient is real."
    And the page shows "Student encounter"
    And the page shows "Dominic Rivera, 27"
    And the page shows "Listening · speak or type"
    And the page shows "Chart · Dominic Rivera"
    And the page shows "From case to feedback in four steps"
    And the page shows "1. Author"
    And the page shows "2. Interview"
    And the page shows "3. Reconcile"
    And the page shows "4. Review"
    And the page shows "Six more patients, each with a conversation to watch"
    And the page shows "Nisha Patel, 29"
    And the page shows "Yvette Armstrong, 74"
    And the page shows "Wyatt Nelson, 23"
    And the page shows "Walter Greene, 79"
    And the page shows "Vadko Bareche, 31"
    And the page shows "Omar Sinclair, 54"
    And the page does not show "Marcus Ramirez"
    And the page does not show "Bedrock configured"
    And the page shows "synthetic patients only"

  Scenario: Calls to action open the simulator
    Given the landing page is open
    When the user follows "Open simulator"
    Then the address contains "app.html"
    And the page shows "Patient Studio"
    And the page shows "Dominic Rivera"
    And the page shows "Nisha Patel"

  Scenario: The hero opens the simulator and returns home
    Given the landing page is open
    When the user follows "Open the simulator"
    Then the address contains "app.html"
    And the page shows "Patient Studio"
    When the user follows the brand home
    Then the address contains "index.html"
    And the page shows "VirtuSP"

  Scenario: In-page links reach the explanation and the roster
    Given the landing page is open
    When the user follows "How it works"
    Then the address contains "#how"
    And the page shows "From case to feedback in four steps"
    When the user follows "Meet the patients"
    Then the address contains "#patients"
    And the page shows "Watch the sample visit, then start it yourself."

  Scenario: The landing page stays usable on a phone-width window
    Given the landing page is open
    When the window is 390 by 844
    Then the page shows "Open simulator"
    And the page shows "Meet the patients"
    And the page shows "Nisha Patel, 29"
    And the page shows "Omar Sinclair, 54"
