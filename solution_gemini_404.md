# Solution: Gemini API "404 Not Found" (Model Version Issue)

## Problem Description
Despite having a valid Google Gemini API Key, requests to the standard model aliases (`gemini-1.5-flash`, `gemini-1.5-pro`) were failing with the following error:

```json
{
  "error": {
    "code": 404,
    "message": "models/gemini-1.5-flash is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.",
    "status": "NOT_FOUND"
  }
}
```

This indicates that these specific model aliases are either deprecated, unavailable in your region, or restricted for your specific API key tier.

## Diagnosis Steps Taken
1.  **Direct API Test**: Attempted `curl` requests with the key. Validated the key format was correct but the specific model endpoint returned 404.
2.  **Model Discovery**: Ran a query against the `https://generativelanguage.googleapis.com/v1beta/models` endpoint to list all models actually available to your specific API key.
3.  **Result Analysis**: The list revealed that `gemini-1.5` variants were missing or restricted, but newer models like `gemini-2.5-flash` (released June 2025) were fully available.

## The Solution
We updated the application configuration to target a specific, available model version instead of the failing alias.

### Code Change
**File**: `src/agent/llm.ts`

```typescript
// OLD (Failing)
const modelName = 'gemini-1.5-flash';

// NEW (Working)
const modelName = 'gemini-2.5-flash';
```

### Verification
A standalone test script (`test-llm.ts`) confirmed that `gemini-2.5-flash` accepts the API key and returns valid responses.

## Key Takeaway
If you encounter `404 Not Found` with a valid API key, the specific model name/alias you are using is likely not available to your account. Always check the available models list (`v1beta/models`) to find a valid alternative.
