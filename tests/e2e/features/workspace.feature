Feature: Simulator workspace
  Faculty and students can reach every workspace, and the theme choice is remembered.

  Scenario: Every workspace is reachable before a visit starts
    Then the page shows "Patient Studio"
    And the page shows "Denise Carter"
    And the page shows "58 · v1"
    And the page shows "Marcus Lee"
    And the page shows "67 · v1"
    And the mode chip reads "Local demo · no API keys"
    When the user opens the "Encounter" workspace
    Then the page shows "Start a visit"
    And the page shows "Choose a patient to begin the conversation."
    When the user opens the "Team" workspace
    Then the page shows "No active encounter"
    And the page shows "Launch a patient first."
    When the user opens the "Assessment" workspace
    Then the page shows "No active encounter"
    And the page shows "Complete an interview first."
    When the user opens the "Ground Truth" workspace
    Then the page shows "Ground Truth"
    And the page shows "The ingest agent writes only claims that quote their source."
    When the user opens the "Patient Studio" workspace
    Then the page shows "Pick a patient or create one. No code."

  Scenario: The mode chip changes while a visit is open
    When the student has launched "Denise Carter"
    Then the mode chip reads "Reviewed reply · approved facts only"
    And the patient photo points at "img/denise.jpg"
    When the user opens the "Patient Studio" workspace
    Then the mode chip reads "Local demo · no API keys"

  Scenario: Theme cycles through light, dark, and auto, and the choice survives reload
    Then the theme button reads "Theme: Auto"
    And the document theme is "auto"
    When the faculty cycles the theme
    Then the theme button reads "Theme: Light"
    And the document theme is "light"
    When the faculty cycles the theme
    Then the theme button reads "Theme: Dark"
    And the document theme is "dark"
    When the page is reloaded
    Then the theme button reads "Theme: Dark"
    And the document theme is "dark"
    When the faculty cycles the theme
    Then the theme button reads "Theme: Auto"
    And the document theme is "auto"

  Scenario: The workspaces stay reachable on a phone-width window
    When the window is 390 by 844
    When the user opens the "Assessment" workspace
    Then the page shows "Complete an interview first."
    When the user opens the "Encounter" workspace
    Then the page shows "Start a visit"
    And the page shows "Theme: Auto"
