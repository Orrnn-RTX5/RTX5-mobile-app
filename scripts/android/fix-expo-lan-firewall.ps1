[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8081,
    [string]$InterfaceAlias = 'WiFi',
    [string]$NodePath = (Get-Command node.exe -ErrorAction Stop).Source,
    [string]$ResultPath
)

$ErrorActionPreference = 'Stop'

try {
    $nodeExecutable = (Resolve-Path -LiteralPath $NodePath).Path
    if ([System.IO.Path]::GetFileName($nodeExecutable) -ne 'node.exe') {
        throw 'NodePath must point to node.exe.'
    }
    $adapter = @(Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop)
    if ($adapter.Count -ne 1 -or $adapter.Status -ne 'Up') {
        throw 'Select one connected network adapter using -InterfaceAlias.'
    }
    $ruleName = 'RTX5-Expo-LAN-TCP-' + $Port + '-' + $adapter.InterfaceIndex
    $description = "Allow Node.js TCP port $Port on $InterfaceAlias from the local subnet."

    if ($PSCmdlet.ShouldProcess($description, 'Configure Expo LAN firewall rule')) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [Security.Principal.WindowsPrincipal]::new($identity)
        if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            throw 'Windows requires administrator access. Run this script in PowerShell as administrator.'
        }
        $settings = @{
            Name = $ruleName
            Description = $description
            Direction = 'Inbound'
            Action = 'Allow'
            Enabled = 'True'
            Profile = @('Private', 'Public')
            Protocol = 'TCP'
            LocalPort = $Port
            RemoteAddress = 'LocalSubnet'
            InterfaceAlias = $InterfaceAlias
            Program = $nodeExecutable
            EdgeTraversalPolicy = 'Block'
        }
        $existing = Get-NetFirewallRule -PolicyStore PersistentStore -Name $ruleName -ErrorAction SilentlyContinue
        if ($existing) {
            Set-NetFirewallRule @settings -PolicyStore PersistentStore | Out-Null
        } else {
            New-NetFirewallRule @settings -PolicyStore PersistentStore -DisplayName "RTX5 Expo LAN ($InterfaceAlias, TCP $Port)" | Out-Null
        }
        $rule = Get-NetFirewallRule -PolicyStore ActiveStore -Name $ruleName
        if ($rule.Enabled.ToString() -ne 'True' -or $rule.Action.ToString() -ne 'Allow') {
            throw 'The rule was created, but is not active. Check the Windows firewall policy.'
        }
        $message = "SUCCESS: Expo LAN is allowed on $InterfaceAlias, TCP $Port, for Node.js from the local subnet. Rule: $ruleName"
        Write-Output $message
        if ($ResultPath) { Set-Content -LiteralPath $ResultPath -Value $message -Encoding UTF8 }
    }
} catch {
    if ($ResultPath) { Set-Content -LiteralPath $ResultPath -Value ('ERROR: ' + $_.Exception.Message) -Encoding UTF8 }
    Write-Error $_
    exit 1
}
