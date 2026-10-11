"use strict";

console.log("Teardown plan only. This command does not destroy resources.");
console.log("Deletion protection is on for the database and load balancer.");
console.log("To review destruction without applying it:");
console.log("  terraform -chdir=infra/aws plan -destroy -input=false -out=tfplan-destroy");
console.log("An apply of that plan still requires deletion_protection=false first.");
console.log("Status: IMPLEMENTED BUT NOT CLOUD VERIFIED");
