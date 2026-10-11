@memory
Feature: Visit memory and talking portrait
  A published visit continues from what the patient already said, and the
  portrait moves while that reply is spoken.

  Scenario: A repeated question continues and the portrait talks
    Given the faculty opens a visit with "Denise Carter"
    Then the visit shows a talking portrait for "Denise Carter"
    When the student sends "What brings you in today?" in the visit
    Then the visit transcript shows "I've been really thirsty and tired for a few months. My doctor says it's diabetes."
    And the visit transcript does not show "I skip the evening"
    When the student sends "What brings you in today?" in the visit
    Then the visit transcript shows "As I said, I've been really thirsty and tired for a few months. My doctor says it's diabetes."
    When the student sends "Tell me more" in the visit
    Then the visit transcript shows "As I said, I've been really thirsty and tired for a few months."
    When the portrait stays on screen while the patient speaks
    And the student sends "Hello" in the visit
    Then the talking portrait is moving
