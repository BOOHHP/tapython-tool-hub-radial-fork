# regen-index.ps1 - trigger tool index regeneration by re-approving any one
# approved submission (publish() calls generateToolData which rebuilds the
# full index from data/tool-docs, including root-level md tools).
param(
    [string]$Hub = 'http://10.2.13.8:8787',
    [string]$SubmissionRoot = '\\10.2.13.8\Server\tapython-tool-hub-radial-fork\.tapython-tool-hub\submissions'
)

$ErrorActionPreference = 'Stop'
$cred = Get-Credential -UserName 'admin' -Message "ToolHub admin ($Hub)"
if (-not $cred) { throw 'Login cancelled.' }
$loginBody = @{ username = $cred.UserName; password = $cred.GetNetworkCredential().Password } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$Hub/api/auth/login" -Method Post -Body $loginBody -ContentType 'application/json' -SessionVariable web
Write-Host "Logged in."

# Pick any approved submission as the regeneration trigger
$triggerId = $null
foreach ($file in (Get-ChildItem $SubmissionRoot -File -Filter '*.json')) {
    $raw = Get-Content $file.FullName -Raw
    if ($raw -match '"status"\s*:\s*"approved"' -and $raw -match '"slug"\s*:\s*"([^"]+)"') {
        $triggerId = $file.BaseName
        $triggerSlug = $Matches[1]
        break
    }
}
if (-not $triggerId) { throw 'No approved submission found to use as trigger.' }

Write-Host "Triggering regeneration via re-approve of '$triggerSlug'..."
$body = @{ reviewer = 'admin'; decision = 'approved'; comment = 'regen index after root-level md restore' } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$Hub/api/admin/submissions/$triggerId/review" -Method Post -Body $body -ContentType 'application/json' -WebSession $web

Start-Sleep -Seconds 2
$index = Invoke-RestMethod -Uri "$Hub/api/tools/index.json" -WebSession $web
Write-Host "Index regenerated: $($index.total) tools."
$index.tools | ForEach-Object { Write-Host "  $($_.slug)" }
