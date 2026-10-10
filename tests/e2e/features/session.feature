@session @regression
Feature: Workspace session
  Faculty and students enter from the public page. The session call uses the
  site's own address, and a foreign address stays forbidden.

  Scenario: Faculty and a student can enter without a forbidden session
    Then the page shows "Choose your workspace"
    And the page shows "Enter faculty workspace"
    And the page shows "Enter student workspace"
    When the user enters the "Faculty" workspace
    Then the page shows "Patient Studio"
    And the page shows "Denise Carter"
    And the page does not show "Cross-origin requests are not allowed."
    And the browser log has no forbidden session response
    When the user switches workspace
    Then the page shows "Choose your workspace"
    When the user enters the "Student" workspace
    Then the page shows "My assigned assessments"
    And the page shows "Student A"
    And the page does not show "Cross-origin requests are not allowed."
    When the user chooses "Individual patient"
    Then the page shows "Choose a patient"
    And the page shows "Denise Carter"
    And the page shows "Start visit"
    And the browser log has no forbidden session response
