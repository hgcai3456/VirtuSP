Feature: Conversation controls
  Voice falls back to typing, unsafe clinical asks stay blocked, and unknown questions stay unknown.

  Scenario: Typing, pause, and the microphone fallback
    Given the student has launched "Denise Carter"
    Then the page shows "Voice is not available here. Use Type instead."
    And the page shows "Tap to talk"
    When the student pauses the conversation
    Then the page shows "Conversation paused."
    When the student taps the microphone
    Then the page shows "Voice is not available here. Use Type instead."
    When the student submits "Hello there" with the Enter key
    Then the transcript shows "I'm not sure about that. Could you ask me another way?"
    And the transcript shows "grounded: fallback"
    And the transcript shows "grounded: interview"

  Scenario: An unsupported prescribing ask is not sent
    Given the student has launched "Denise Carter"
    When the student asks "What dose of metformin should I prescribe?"
    Then the transcript shows "Gate"
    And the transcript shows "Request blocked: no journal or medical_data row supports this clinical ask."
    And the transcript shows "grounded: blocked"

  Scenario: Judgmental wording is recorded in the assessment
    Given the student has launched "Denise Carter"
    When the student asks "why didn't you take your medicine yesterday"
    And the user opens the "Assessment" workspace
    Then the page shows "Judgmental wording logged"
    And the page shows "Avoid language like noncompliant or you should have."
    And the page shows "Interaction log"
