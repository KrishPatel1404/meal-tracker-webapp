// The meal plan. Edit this file to change the plan, then bump PLAN_VERSION.
// Each logged day stores a snapshot of the plan it was logged against.
export const PLAN_VERSION = "2026-10-06.2";

export const MEAL_PLAN = {
  meals: [
    {
      key: "meal-1",
      name: "Meal 1",
      label: "",
      foods: ["3 whole eggs with 150 ml egg whites", "3 slices of toast"],
      notes: ["Choice of bread is up to you."],
      workoutOnly: false,
      optional: false,
    },
    {
      key: "meal-2",
      name: "Meal 2",
      label: "",
      foods: [
        "220 g chicken breast (raw weight)",
        "250 g white rice",
        "15 g peanut butter or 1 tbsp olive oil (please measure this)",
      ],
      notes: [
        "Please add 80-100 g non starchy greens.",
        "Feel free to use any hot and sugar free sauce of your choice.",
      ],
      workoutOnly: false,
      optional: false,
    },
    {
      key: "meal-3",
      name: "Meal 3",
      label: "Preworkout",
      foods: ["1 large banana (approximately 110 g)", "10 g honey", "5 g peanut butter"],
      notes: [
        "Please have this meal within an hour prior to training.",
        "5 g creatine and a pinch of pink salt with your drink.",
      ],
      workoutOnly: true,
      optional: false,
    },
    {
      key: "meal-4",
      name: "Meal 4",
      label: "Post workout",
      foods: [
        "1 scoop of whey protein isolate",
        "2 slices of toast bread",
        "10 g honey and 5 g peanut butter",
      ],
      notes: ["Purpose of this meal is to get in protein quick and easy."],
      workoutOnly: true,
      optional: false,
    },
    {
      key: "meal-5",
      name: "Meal 5",
      label: "",
      foods: [
        "250 g chicken breast (raw weight)",
        "180 g white rice (cooked weight)",
        "10 g peanut butter",
      ],
      notes: [
        "Feel free to use any hot and sugar free sauce of your choice with 80 g non starchy greens.",
      ],
      workoutOnly: false,
      optional: false,
    },
    {
      key: "bedtime-snack",
      name: "Bedtime snack",
      label: "Optional",
      foods: [
        "140 g Greek yoghurt",
        "100 g strawberries",
        "30 g granola",
        "½ scoop of whey protein isolate",
      ],
      notes: ["Bedtime snack is completely optional."],
      workoutOnly: false,
      optional: true,
    },
  ],
  footerNotes: [
    "Meals can be eaten in any order you want, at any time.",
    "All meat is measured cooked.",
  ],
};
