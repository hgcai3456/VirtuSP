Feature: Ground truth library
  The publication library only keeps claims that quote their source, and faculty can search it.

  Scenario: Faculty load, search, and reject ungrounded publications
    When the user opens the "Ground Truth" workspace
    And the faculty waits for the library to load
    Then the page shows "No journals yet. Load the seed set or ingest a PubMed record."
    And the page shows "0 journals"
    And the page shows "0 medical_data rows"
    And the page shows "shard 0"
    When the faculty sets the PubMed result limit to "3"
    And the faculty presses "Ingest PMID"
    Then the page shows "Enter a PubMed ID."
    When the faculty presses "Ingest search"
    Then the page shows "Enter a PubMed search."
    When the faculty ingests this publication JSON:
      """
      {
      """
    Then the page shows "JSON"
    When the faculty ingests this publication JSON:
      """
      {"abstract":"This abstract has no title field."}
      """
    Then the page shows "Publication is missing a title"
    When the faculty presses "Load seed publications"
    Then the page shows "Ingested 4 publication(s) and added 4 grounded fact(s)."
    And the page shows "4 journals"
    And the page shows "4 medical_data rows"
    And a PubMed link for "11942998" is shown
    When the faculty searches grounded facts for "metformin"
    Then the page shows "Gastrointestinal intolerance is a documented reason patients discontinue or skip metformin."
    When the faculty searches grounded facts for "inhaler technique" with Enter
    Then the page shows "Errors in inhaler technique are common and have consequences for drug delivery."
    When the faculty ingests a unique grounded publication
    Then the page shows "5 journals"
    And the page shows "5 medical_data rows"
    When the faculty searches grounded facts for "regression claim"
    Then the library lists the unique publication
