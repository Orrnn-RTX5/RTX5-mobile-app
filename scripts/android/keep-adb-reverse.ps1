param(
  [int]$IntervalSeconds = 2,
  [int]$Port = 8081
)

$ErrorActionPreference = 'SilentlyContinue'

while ($true) {
  adb reverse "tcp:$Port" "tcp:$Port" | Out-Null
  Start-Sleep -Seconds $IntervalSeconds
}
