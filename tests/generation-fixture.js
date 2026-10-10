"use strict";
module.exports = function fixture() {
  const labels = [
    [
      "I came to discuss my cholesterol.",
      "Reason for visit",
      ["bring", "visit", "cholesterol"],
    ],
    [
      "I heard it was high at my last checkup.",
      "Patient understanding",
      ["understand", "know"],
    ],
    [
      "I am worried about taking a new medication.",
      "Medication concerns",
      ["worried", "concerns"],
    ],
    [
      "I have not started a cholesterol medication.",
      "Current medication",
      ["medications", "taking"],
    ],
    [
      "My allergy history has not been specified.",
      "Allergy history",
      ["allergies", "allergic"],
    ],
    ["I have not had chest pain.", "Associated symptoms", ["chest pain"]],
    ["I go walking on weekends.", "Activity", ["exercise", "activity"]],
    ["I like cooking at home.", "Meals", ["diet", "food"]],
    ["My father had high cholesterol.", "Family history", ["family", "father"]],
    ["I do not smoke.", "Tobacco", ["smoke", "tobacco"]],
    [
      "I worry about the cost of treatment.",
      "Financial concerns",
      ["cost", "afford"],
    ],
    [
      "I want to understand my choices.",
      "Treatment goals",
      ["goals", "choices"],
    ],
    ["I work as a librarian.", "Work", ["work", "job"]],
    ["I live with my partner.", "Home support", ["home", "support"]],
  ];
  const facts = labels.map(([label, topic, kw], i) => ({
    label,
    say: label,
    topic,
    kw,
    vis: "ask",
    ehr: i >= 6 && i !== 8 && i !== 11 ? "soc" : "hx",
    src: "synthetic-case",
    quote: "",
    origin: "synthetic",
    gate: i === 10 ? 1 : 0,
    deflect:
      i === 10
        ? "I'd like to feel more comfortable before we discuss that."
        : "",
    lab: false,
    test: "",
    value: "",
    unit: "",
    ref: "",
    date: "",
  }));
  facts.push(
    ...[
      {
        test: "Total cholesterol",
        value: "240",
        unit: "mg/dL",
        ref: "Desirable below 200 mg/dL",
      },
      {
        test: "LDL cholesterol",
        value: "160",
        unit: "mg/dL",
        ref: "Context: cardiovascular risk discussion",
      },
    ].map((r) => ({
      ...r,
      label: `${r.test}: ${r.value} ${r.unit}; ${r.ref}`,
      say: "",
      topic: r.test,
      kw: ["cholesterol results", "labs"],
      vis: "chart",
      ehr: "labs",
      src: "synthetic-case",
      quote: "",
      origin: "synthetic",
      gate: 0,
      deflect: "",
      lab: true,
      date: "2026-10-10",
    })),
  );
  facts.forEach((f, i) => (f.id = "case-fact-" + i));
  return {
    draft: {
      name: "Taylor Reed",
      age: 46,
      gender: "Female",
      ethnicity: "",
      intro: "Hello, I'm Taylor. I came to talk about my cholesterol.",
      summary:
        "A fictional adult seeking a shared decision about cholesterol treatment. The chart contains a synthetic lipid report. She understands that cholesterol was elevated but does not recall numerical results. She wants clear explanations and feels guarded about cost until the student acknowledges her concerns.",
      personality: "Thoughtful, curious and initially reserved.",
      style: "Plain language with follow-up questions.",
      emotion: "Worried about treatment choices.",
      facts,
      objectives: [
        {
          title: "Elicit medication concerns",
          tip: "Ask about what worries the patient.",
          factIds: ["case-fact-2"],
        },
        {
          title: "Explore goals",
          tip: "Invite the patient's priorities.",
          factIds: ["case-fact-11"],
        },
        {
          title: "Review lipid results",
          tip: "Discuss findings in context.",
          factIds: ["case-fact-14", "case-fact-15"],
        },
      ],
      missing: [
        "Prior imaging not specified.",
        "Previous treatment dates not specified.",
      ],
    },
    review: {
      supported: true,
      reason: "Coherent fictional case for faculty review.",
    },
  };
};
