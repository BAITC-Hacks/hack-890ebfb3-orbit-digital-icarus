# Optional NVIDIA / OpenAI evidence proposals

This development tool asks a hosted model to propose exact quotes from selected contractor descriptions. It can reduce the work of preparing evidence for a larger catalog. The committed, reviewed evidence continues to drive every live match; neither provider is a runtime dependency and their availability does not affect ordering or response time.

## Credentials and bounded use

Keep each key in a file **outside the repository**, or supply it through the appropriate process environment variable, `NVIDIA_API_KEY` or `OPENAI_API_KEY`. The tool never reads credentials during a dry run, sends them to the frontend, or writes them into proposals. Do not fill a secret into `.env.example`. The repository ignores local environment files, common API-key filenames, `secrets/`, and `artifacts/`.

The network destination is fixed to the selected provider's HTTPS chat-completions endpoint. Redirects, automatic retries and automatic provider switching are disabled. Each execution can make one request, with at most three profiles and 12,000 characters of source data. The default output allowance is 512 tokens and the hard maximum is 1,024. The request has a 30-second network timeout. See [NVIDIA's hosted API reference](https://docs.api.nvidia.com/nim/re/reference/llm-apis) and [OpenAI's chat-completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

An ignored local usage ledger reserves an attempt **before** sending it. A failed or uncertain request still consumes the attempt. At most three attempts **combined across providers** are allowed in this checkout; a content-hash cache prevents paying again for the same successful request. A concurrent run or corrupt ledger blocks execution. Never delete or reset the ledger to bypass the cap.

These limits reduce usage; they are **not an account-wide dollar limit**. Other machines, checkouts, tools, account users and provider pricing are outside this ledger. Confirm charges and remaining credit in the NVIDIA account before expanding usage. No dollar cost or remaining balance is inferred from token counts. Normal app requests and automated tests make no paid inference calls.

## Run

From the repository root, preview one request without reading a key or contacting the provider:

```bash
python scripts/propose_evidence.py --provider nvidia --profile-id HK-42352
```

To execute that one request using an existing external key file, replace the example path with your local path:

```powershell
python scripts/propose_evidence.py --provider nvidia --profile-id HK-42352 --execute --key-file "C:\secure\nvidia-key.txt"
```

For the explicit OpenAI alternative:

```powershell
python scripts/propose_evidence.py --provider openai --profile-id HK-42352 --execute --key-file "C:\secure\openai-key.txt"
```

Alternatively, use the selected provider's already-set environment variable and omit `--key-file`. Do not put the key value in a shell command or commit it. Use `--profile-id` up to three times for a small batch and `--max-tokens` only when a reviewed task needs a different output limit.

The NVIDIA default model is `nvidia/mistral-nemo-minitron-8b-8k-instruct`, selected from the model-list response inspected on 23 September 2026. The OpenAI default is the pinned `gpt-4.1-mini-2025-04-14` snapshot, with strict JSON-schema output and `store: false`. `--model` permits an available compatible replacement; model-list availability alone does not prove that a completion request is authorized. The provider, source hash, exact prompt content, model, profile inputs, token limit and prompt version participate in the cache key. No request automatically selects a different model after failure.

## Review and adoption

The tool writes only into ignored `artifacts/nvidia-evidence/`; this historical directory name is retained so adding OpenAI does not reset the existing ledger. It reports the proposal filename, attempt count and validated token usage when supplied by the provider. Validate a successful proposal using its returned filename:

```bash
python scripts/validate_evidence_proposal.py --input artifacts/nvidia-evidence/proposal-REQUEST_HASH.json
```

Replace `REQUEST_HASH` with the hash in the actual report. Both commands validate source containment, contractor identity, distinct records and supported format labels. The model cannot supply record IDs; the tool derives them from the validated record content. Unknown profiles, invented quotes, unsupported labels, duplicate JSON keys, extra output fields and truncated completions fail validation. Descriptions are explicitly treated as untrusted data in the extraction prompt.

Semantic review is still necessary: an exact quote can contain marketing, an irrelevant claim, or an instruction embedded in the profile. For the smoke profile HK-42352, experience hosting weddings supports `свадьба`; it does not prove `той` experience. The divorce statistic should be excluded. Prefer concise useful service or experience facts, then review the entire profile and tag rationale.

Nothing overwrites or promotes `backend/app/matching/profile_evidence.json`. A reviewed adoption would be a separate change that preserves the rest of the catalog, records provenance, changes the evidence digest, and reruns ranking, hidden-name and dataset checks. Until then, the model output remains an unapproved proposal.

## Offline tests

The tool tests use mocked provider responses and temporary local ledgers. They cover provider isolation, strict OpenAI schemas, budget limits, caching, missing credentials, malformed/untrusted output, request failure and secret redaction. They require no keys or provider access and are included in the normal Python suite. CI never makes an inference request.

## Recorded smoke check, 23 September 2026

The NVIDIA completion attempt returned HTTP 401; no successful NVIDIA generation is claimed. The request was not retried. The separately selected OpenAI request succeeded for HK-42352 using **410 input + 91 output = 501 total tokens**. One cached replay required no additional provider call. These two attempts remain counted in the local ledger.

The OpenAI response passed structural/source validation but proposed both a wedding-experience quote and a divorce statistic. Review rejected the statistic as unsuitable for a contractor recommendation despite its exact presence in the source. **The proposal was not adopted**, and production evidence/ranking did not change. This concrete failure illustrates why source containment and JSON schemas alone do not establish useful, appropriate explanations. The recorded usage does not prove account balance or invoiced charges.
