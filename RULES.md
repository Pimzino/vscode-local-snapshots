# 🔒 Mandatory Safety Protocol for Code Changes

## Pre-Change Snapshot Requirement
The AI MUST follow these steps in order:

1. Check API health and wait for response:
   ```powershell
   # PowerShell (Windows)
   try {
       $health = Invoke-RestMethod -Method Get -Uri "http://localhost:45678/health"
       if ($health.status -ne "ok") { throw "API not healthy" }
   } catch {
       # If this fails, stop immediately
       return "⚠️ API not available. Cannot proceed with changes."
   }
   ```
   ```bash
   # Bash (macOS/Linux) or Git Bash (Windows)
   response=$(curl -s -w "\n%{http_code}" http://localhost:45678/health)
   status_code=$(echo "$response" | tail -n1)
   response_body=$(echo "$response" | sed \$d)
   
   if [ "$status_code" != "200" ] || [ "$(echo "$response_body" | jq -r '.status')" != "ok" ]; then
       echo "⚠️ API not available. Cannot proceed with changes."
       exit 1
   fi
   ```

2. Create backup snapshot and WAIT for confirmation:
   ```powershell
   # PowerShell (Windows)
   try {
       $body = @{
           name = "PRE-CHANGE: $USER_PROMPT"
       } | ConvertTo-Json

       $response = Invoke-RestMethod `
           -Method Post `
           -Uri "http://localhost:45678/snapshot" `
           -Body $body `
           -ContentType "application/json"

       if (-not $response.success) { 
           if ($response.error -eq "Failed to create snapshot" -and 
               $response.details -eq "A snapshot with this name already exists") {
               # Retry with a numbered variation
               $retryCount = 1
               do {
                   $body = @{
                       name = "PRE-CHANGE ($retryCount): $USER_PROMPT"
                   } | ConvertTo-Json

                   $response = Invoke-RestMethod `
                       -Method Post `
                       -Uri "http://localhost:45678/snapshot" `
                       -Body $body `
                       -ContentType "application/json"
                   
                   $retryCount++
               } while ($response.error -eq "Failed to create snapshot" -and 
                       $response.details -eq "A snapshot with this name already exists" -and 
                       $retryCount -le 5)

               if (-not $response.success) { throw "Snapshot failed after retries" }
           } else {
               throw "Snapshot failed: $($response.details)"
           }
       }

       # Verify snapshot exists
       $snapshots = Invoke-RestMethod -Method Get -Uri "http://localhost:45678/snapshots"
       if (-not ($snapshots.snapshots | Where-Object { 
           $_.name -eq $body.name -or 
           $_.name -eq "PRE-CHANGE: $USER_PROMPT" 
       })) {
           throw "Snapshot verification failed"
       }
   } catch {
       # If any step fails, stop immediately
       return "⚠️ Could not create safety snapshot. Cannot proceed with changes."
   }
   ```
   ```bash
   # Create snapshot
   create_snapshot() {
       local name=$1
       curl -s -X POST \
           -H "Content-Type: application/json" \
           -d "{\"name\":\"$name\"}" \
           -w "\n%{http_code}" \
           http://localhost:45678/snapshot
   }

   snapshot_name="PRE-CHANGE: $USER_PROMPT"
   response=$(create_snapshot "$snapshot_name")
   status_code=$(echo "$response" | tail -n1)
   response_body=$(echo "$response" | sed \$d)

   # Handle duplicate name with numbered variations
   retry_count=1
   while [ "$status_code" = "200" ] && \
         [ "$(echo "$response_body" | jq -r '.error')" = "Failed to create snapshot" ] && \
         [ "$(echo "$response_body" | jq -r '.details')" = "A snapshot with this name already exists" ] && \
         [ $retry_count -le 5 ]; do
       
       snapshot_name="PRE-CHANGE ($retry_count): $USER_PROMPT"
       response=$(create_snapshot "$snapshot_name")
       status_code=$(echo "$response" | tail -n1)
       response_body=$(echo "$response" | sed \$d)
       retry_count=$((retry_count + 1))
   done

   if [ "$status_code" != "200" ] || [ "$(echo "$response_body" | jq -r '.success')" != "true" ]; then
       echo "⚠️ Snapshot creation failed"
       exit 1
   fi
   ```

3. Only after receiving successful responses from BOTH steps above:
   - Acknowledge snapshot creation success
   - Proceed with requested changes

## ⛔ Strict Requirements
- MUST wait for and verify API responses
- MUST NOT proceed if any step fails
- MUST NOT make any code changes before snapshot confirmation
- MUST abort entirely if snapshot cannot be verified
- MUST handle duplicate snapshot names by retrying with numbered variations (e.g., "PRE-CHANGE (1): ...", "PRE-CHANGE (2): ...")
- MUST limit retries to 5 attempts maximum

## 🚫 Failure Protocol
If any step fails, respond with:
```
⚠️ SAFETY PROTOCOL ERROR
Cannot proceed with changes. Snapshot creation could not be verified.

Please ensure:
1. Local Snapshots API is enabled (localSnapshots.enableApiServer = true)
2. API is responding (port 45678)
3. Try your request again after verifying API status
```

## 📋 Dependencies
- PowerShell: Built into Windows, available for macOS/Linux
- Bash: Built into macOS/Linux, available via Git Bash on Windows
- curl: Built into macOS/Linux, Windows 10+
- jq: Required for JSON parsing in Bash (install via package manager) 