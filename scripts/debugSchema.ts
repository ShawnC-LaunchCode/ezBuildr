
import { workflowSnapshots } from "../shared/schema/index";
import { workflowSnapshots as wsAuth } from "../shared/schema/workflow";

console.log("From index:", workflowSnapshots);
console.log("From workflow:", wsAuth);

if (workflowSnapshots) {
    console.log("Symbols:", Object.getOwnPropertySymbols(workflowSnapshots).map(String));
} else {
    console.log("From index is UNDEFINED");
}
