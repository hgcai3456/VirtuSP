Feature: Landing page
  A visitor can understand VirtuSP and open the simulator without signing in.

  Scenario: The marketing page explains the product
    Given the landing page is open
    Then the logo image loads
    And the page shows "Practice the difficult conversation before the patient is real."
    And the page shows "45-day gap in metformin refills."
    And the page shows "From case to feedback in four steps"
    And the page shows "1. Author"
    And the page shows "2. Interview"
    And the page shows "3. Reconcile"
    And the page shows "4. Review"
    And the page shows "The model never decides what is medically true"
    And the page shows "I'm not sure."
    And the page shows "synthetic patients only"

  Scenario: Calls to action open the simulator
    Given the landing page is open
    When the user follows "Open simulator"
    Then the address contains "app.html"
    And the page shows "Patient Studio"
    And the page shows "Denise Carter"
    And the page shows "Marcus Lee"

  Scenario: Meet Denise opens the same simulator
    Given the landing page is open
    When the user follows "Meet Denise"
    Then the address contains "app.html"
    And the page shows "Patient Studio"
    When the user follows the brand home
    Then the address contains "index.html"
    And the logo image loads

  Scenario: In-page links reach the explanation and the safety promise
    Given the landing page is open
    When the user follows "How it works"
    Then the address contains "#how"
    And the page shows "From case to feedback in four steps"
    When the user follows "See how it works"
    Then the address contains "#how"
    When the user follows "Clinical safety"
    Then the address contains "#safe"
    And the page shows "The model never decides what is medically true"

  Scenario: The landing page stays usable on a phone-width window
    Given the landing page is open
    When the window is 390 by 844
    Then the page shows "Open simulator"
    And the page shows "Meet Denise"
    And the page shows "Clinical safety"
