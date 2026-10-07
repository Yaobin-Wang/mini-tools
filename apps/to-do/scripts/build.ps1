$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
