$TodoRoot = Split-Path -Parent $PSScriptRoot
$env:TEMP = Join-Path $TodoRoot '.runtime\tmp'
$env:TMP = $env:TEMP
$env:NPM_CONFIG_CACHE = Join-Path $TodoRoot '.runtime\npm-cache'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $TodoRoot '.runtime\test-browsers'
foreach ($dir in @($env:TEMP,$env:NPM_CONFIG_CACHE,$env:PLAYWRIGHT_BROWSERS_PATH,(Join-Path $TodoRoot '.runtime\logs'),(Join-Path $TodoRoot '.runtime\test-results'))) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
Set-Location -LiteralPath $TodoRoot
