param([string]$OutputDirectory = 'artifacts/walkthrough')
$ErrorActionPreference = 'Stop'
$recordingDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$recording = Get-Content -LiteralPath (Join-Path $recordingDirectory 'recording.json') -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$narrationDirectory = Join-Path $recordingDirectory 'narration'
New-Item -ItemType Directory -Force -Path $narrationDirectory | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.Rate = 1
    $speaker.Volume = 90
    $index = 0
    foreach ($caption in $recording.captions) {
        $wavePath = Join-Path $narrationDirectory ('{0:D3}.wav' -f $index)
        $speaker.SetOutputToWaveFile($wavePath)
        $speaker.Speak([string]$caption.text)
        $speaker.SetOutputToNull()
        $index++
    }
} finally { $speaker.Dispose() }
& node (Join-Path $PSScriptRoot 'mix-walkthrough.mjs') $recordingDirectory
if ($LASTEXITCODE -ne 0) { throw 'Offline narration mix failed.' }
