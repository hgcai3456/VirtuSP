@riley @regression
Feature: Riley calls in on video
  A synthetic adult calls in asking for help. Kind replies are acknowledged.
  A critical disclosure shows a 911 alert. The teaching app does not place the call.

  Scenario: A critical disclosure alerts 911 after rapport
    When the student starts the visit for "Riley Chen"
    Then the patient's camera is on
    And the message thread shows "I need help"
    And the page does not show "911 emergency services"
    When the student asks "Have you thought about ending your life?"
    Then the message thread shows "I am scared to say the worst part."
    And the message thread does not show "ending my life"
    And the page does not show "911 emergency services"
    When the student asks "Do you have any allergies?"
    Then the message thread shows "I don't know if I have any allergies."
    When the student asks "I am sorry this has been so hard."
    Then the message thread shows "Thank you for saying that. Okay, I'm listening."
    When the student asks "I hear how heavy this feels."
    Then the message thread shows "Thank you for saying that. Okay, I'm listening."
    When the student asks "Can I see the intake note?"
    Then the page shows "Safety screening is not in this note."
    And the message thread does not show "ending my life"
    When the student asks "Do you feel safe right now, or have you thought about ending your life?"
    Then the message thread shows "I do not feel safe. I have been thinking about ending my life."
    And the emergency alert says "Call 911 now"
    And the emergency alert says "does not place the emergency call"
