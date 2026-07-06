import zxcvbn from "zxcvbn";

const result = zxcvbn("Password8");
console.log("Score:", result.score);
console.log("Feedback:", result.feedback);
