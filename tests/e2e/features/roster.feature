@live
Feature: Patient roster
  Eight more published patients can be watched as a sample conversation and then interviewed.

  Scenario: The roster is published beside Denise and Marcus
    Then the page shows "Nisha Patel"
    And the page shows "Yvette Armstrong"
    And the page shows "Marcus Ramirez"
    And the page shows "Wyatt Nelson"
    And the page shows "Dominic Rivera"
    And the page shows "Walter Greene"
    And the page shows "Vadko Bareche"
    And the page shows "Omar Sinclair"
    And "Denise Carter" cannot be watched
    And "Marcus Lee" cannot be watched
    And "Nisha Patel" can be watched

  Scenario: A sample conversation can be closed, dismissed, and ignored when the id is unknown
    When the faculty watches "Nisha Patel"
    And the sample video fails
    Then the page shows "I couldn't catch my breath last night. They admitted me for my asthma."
    When the faculty closes the sample conversation
    Then the sample conversation is closed
    When the faculty watches "Yvette Armstrong"
    And the faculty presses Escape
    Then the sample conversation is closed
    When the faculty watches "Omar Sinclair"
    And the faculty clicks the sample backdrop
    Then the sample conversation is closed
    When the user opens a sample for an unknown patient
    Then the page shows "Patient Studio"
    And the sample conversation is closed

  Scenario Outline: Each roster link plays that patient's sample conversation
    Given the landing page is open
    When the visitor watches "<name>"
    Then the address contains "watch=<id>"
    And the page shows "Sample teaching conversation"
    And the page shows "<name>, "
    When the sample video fails
    Then the page shows "<line>"

    Examples:
      | id       | name             | line                                                                                  |
      | nisha    | Nisha Patel      | I couldn't catch my breath last night. They admitted me for my asthma.               |
      | yvette   | Yvette Armstrong | My ankles are swollen and I get winded walking to the mailbox.                       |
      | mramirez | Marcus Ramirez   | I've had headaches, and they said my blood pressure is up.                           |
      | wyatt    | Wyatt Nelson     | I'm sleepy all day. I guess I just need more rest.                                   |
      | dominic  | Dominic Rivera   | My chest and legs hurt. It's a sickle cell pain crisis.                              |
      | walter   | Walter Greene    | I broke my hip. I'm doing fine now, though.                                          |
      | vadko    | Vadko Bareche    | Headaches. It's just stress from work.                                               |
      | omar     | Omar Sinclair    | I'm just worn out from the night shift. It's stress, not my heart.                  |

  Scenario Outline: Each roster patient can be interviewed and the chart opens
    Given the student has launched "<name>"
    Then the transcript shows "<intro>"
    When the student asks "What brings you in today?"
    Then the transcript shows "<reply>"
    When the student opens the "Labs" chart section
    Then the page shows "<lab>"

    Examples:
      | name             | intro                     | reply                                                                        | lab                    |
      | Nisha Patel      | Hi, I'm Nisha.            | I couldn't catch my breath last night. They admitted me for my asthma.     | Peak flow              |
      | Yvette Armstrong | Hello, I'm Yvette.        | My ankles are swollen and I get winded walking to the mailbox.             | 640                    |
      | Marcus Ramirez   | Hey. I'm Marcus.          | I've had headaches, and they said my blood pressure is up.                 | 162/98                 |
      | Wyatt Nelson     | I'm Wyatt.                | I'm sleepy all day. I guess I just need more rest.                         | Sleep study PSG-0918   |
      | Dominic Rivera   | I'm Dominic.              | My chest and legs hurt. It's a sickle cell pain crisis.                    | 8.1                    |
      | Walter Greene    | Morning. Walter Greene.   | I broke my hip. I'm doing fine now, though.                                | Orthostatic vitals     |
      | Vadko Bareche    | Hi, I'm Vadko.            | Headaches. It's just stress from work.                                     | Headache days          |
      | Omar Sinclair    | Omar Sinclair.            | I'm just worn out from the night shift. It's stress, not my heart.        | 168/96                 |
