$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm.cmd run test:e2e
exit $LASTEXITCODE
