# CI Failure Analysis: Azure Static Web Apps Staging Limit

## Summary
The Azure Static Web Apps deploy step in GitHub Actions fails with a `BadRequest` response because the linked Static Web App already has the maximum number of staging environments.

## Evidence from Logs
The failing job emits the following message when running the `Azure/static-web-apps-deploy@v1` action:

```
The content server has rejected the request with: BadRequest
Reason: This Static Web App already has the maximum number of staging environments (System.Threading.Tasks.Task`1[System.Int32]). Please remove one and try again.
```

This occurs after the action skips the application build (per `skip_app_build: true`) and before uploading the static site content, indicating that authentication succeeded but the deployment was rejected by the service.

### Recurring Failure Confirmation (DeploymentId: bf351987-d83d-4feb-8fa7-25130b770c62)

A subsequent run reproduced the same error with deployment ID `bf351987-d83d-4feb-8fa7-25130b770c62`. The workflow again validated the app location, skipped the build, and then failed with the identical `maximum number of staging environments` rejection. This confirms the quota has still not been cleared since the previous investigation.

## Root Cause
Azure Static Web Apps limits the number of concurrent staging environments (preview environments) per app. When that limit is reached, new preview environments cannot be created for additional pull requests or commits. The workflow attempts to create or update a staging environment for this branch, but the service refuses the request because the quota is already full.

## Recommended Remediation
1. **Clean up existing staging environments** in the Azure Portal for the associated Static Web App. Remove unused environments to free capacity.
2. **Adjust workflow usage** if frequent staging deployments are expected:
   - Periodically prune environments automatically via scripts or scheduled jobs.
   - Consider consolidating branches or disabling staging environments for non-critical branches.
3. **Increase capacity** (if available) by upgrading the Static Web Apps plan or leveraging multiple apps to distribute preview environments.

Once at least one staging slot is freed (or capacity increased), rerun the GitHub Action to validate that the deployment succeeds.
