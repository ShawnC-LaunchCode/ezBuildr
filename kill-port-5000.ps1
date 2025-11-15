$processId = (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($processId) {
  Stop-Process -Id $processId -Force
  Write-Host "Killed process $processId"
} else {
  Write-Host "No process found on port 5000"
}
