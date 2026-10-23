# republish-missing-tools.ps1 - re-publish approved submissions whose tool
# source files are missing from data/tool-docs on the server.
# Works by calling the admin review API with decision=approved, which triggers
# SubmissionWorkflow.publish() to write source files and regenerate data.
#
# Requires: session file created by login (toolhub-session.xml)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\republish-missing-tools.ps1 [-Hub http://10.2.13.8:8787]

param(
    [string]$Hub = 'http://10.2.13.8:8787',
    [string]$SubmissionRoot = '\\10.2.13.8\Server\tapython-tool-hub-radial-fork\.tapython-tool-hub\submissions'
)

$ErrorActionPreference = 'Stop'

# 0. Login (credential prompt; password never passes through the model)
$cred = Get-Credential -UserName 'admin' -Message "ToolHub admin ($Hub)"
if (-not $cred) { throw 'Login cancelled.' }
$loginBody = @{ username = $cred.UserName; password = $cred.GetNetworkCredential().Password } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$Hub/api/auth/login" -Method Post -Body $loginBody -ContentType 'application/json' -SessionVariable web
Write-Host "Logged in as $($cred.UserName)."
$apiSlugs = @($index.tools | ForEach-Object { $_.slug })
Write-Host "API currently has $($apiSlugs.Count) tools: $($apiSlugs -join ', ')"

# 2. Collect approved submissions from the file store
$approved = @()
foreach ($file in (Get-ChildItem $SubmissionRoot -File -Filter '*.json')) {
    $raw = Get-Content $file.FullName -Raw
    if ($raw -match '"status"\s*:\s*"approved"' -and $raw -match '"slug"\s*:\s*"([^"]+)"') {
        $approved += [PSCustomObject]@{
            Slug = $Matches[1]
            Id   = [IO.Path]::GetFileNameWithoutExtension($file.Name)
        }
    }
}
$approved = $approved | Sort-Object Slug -Unique
Write-Host "Found $($approved.Count) approved submissions in file store."

# 3. Determine which are missing from the API
$missing = @($approved | Where-Object { $apiSlugs -notcontains $_.Slug })
if ($missing.Count -eq 0) {
    Write-Host 'Nothing to republish - all approved tools are already in the API.'
    exit 0
}
Write-Host "Missing from API ($($missing.Count)):"
$missing | ForEach-Object { Write-Host "  $($_.Slug) ($($_.Id))" }

# 4. Re-approve each missing submission via the admin review API
$ok = @(); $fail = @()
foreach ($item in $missing) {
    Write-Host "Republishing $($item.Slug)..."
    $body = @{ reviewer = 'admin'; decision = 'approved'; comment = 'republish: source files missing after deploy' } | ConvertTo-Json
    try {
        $resp = Invoke-RestMethod -Uri "$Hub/api/admin/submissions/$($item.Id)/review" `
            -Method Post -Body $body -ContentType 'application/json' -WebSession $web
        $ok += $item.Slug
        Write-Host "  OK -> status=$($resp.status)"
    } catch {
        $fail += $item.Slug
        Write-Host "  FAILED: $($_.Exception.Message)"
    }
}

# 5. Verify final state
Start-Sleep -Seconds 2
$index2 = Invoke-RestMethod -Uri "$Hub/api/tools/index.json" -WebSession $web
$final = @($index2.tools | ForEach-Object { $_.slug })
Write-Host ''
Write-Host "=== RESULT ==="
Write-Host "Republished: $($ok.Count) ($($ok -join ', '))"
if ($fail.Count) { Write-Host "Failed: $($fail.Count) ($($fail -join ', '))" }
Write-Host "API now has $($final.Count) tools:"
$final | ForEach-Object { Write-Host "  $_" }
