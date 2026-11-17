param(
    [string]$Workbook = (Join-Path $PSScriptRoot '..\data\ルーブル音声ガイド_候補200作品.xlsx')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$project = Split-Path -Parent $PSScriptRoot
$catalogPath = Join-Path $project 'src\works.json'
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Workbook))
try {
    $entry = $zip.GetEntry('xl/worksheets/sheet1.xml')
    if (-not $entry) { throw 'The workbook has no first worksheet.' }
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try { [xml]$sheet = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $zip.Dispose() }

$ns = [System.Xml.XmlNamespaceManager]::new($sheet.NameTable)
$ns.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$candidates = foreach ($row in $sheet.SelectNodes('//m:sheetData/m:row', $ns)) {
    if ([int]$row.r -lt 6) { continue }
    $values = @{}
    foreach ($cell in $row.SelectNodes('./m:c', $ns)) {
        $column = $cell.r -replace '\d', ''
        $text = @($cell.SelectNodes('./m:is//m:t', $ns) | ForEach-Object InnerText) -join ''
        if (-not $text) { $valueNode = $cell.SelectSingleNode('./m:v', $ns); if ($valueNode) { $text = $valueNode.InnerText } }
        $values[$column] = $text
    }
    if ($values.A -notmatch '^\d+$') { continue }
    if (-not $values.C -or -not $values.E -or -not $values.F) { throw "Incomplete work at sheet row $($row.r)." }
    [pscustomobject]@{
        rank = [int]$values.A; priority = $values.B; title = $values.C
        author = $values.D; background = $values.E; look = $values.F; source = $values.G
    }
}
if ($candidates.Count -ne 200) { throw "Expected 200 candidates; found $($candidates.Count)." }
if (@($candidates | Group-Object title | Where-Object Count -gt 1).Count) { throw 'Duplicate titles in workbook.' }

$existing = Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
$byTitle = @{}
foreach ($work in $existing) { $byTitle[$work.title] = $work }
$nextId = 1 + (@($existing | Where-Object id -Match '^catalog-\d+$' | ForEach-Object { [int]($_.id -replace '^catalog-', '') } | Measure-Object -Maximum).Maximum)
$catalog = foreach ($candidate in $candidates | Sort-Object rank) {
    if ($byTitle.ContainsKey($candidate.title)) {
        $work = $byTitle[$candidate.title]
        $work | Add-Member -NotePropertyName catalogRank -NotePropertyValue $candidate.rank -Force
        $work | Add-Member -NotePropertyName catalogPriority -NotePropertyValue $candidate.priority -Force
        if ($work.sourceWorkbook) {
            $work.author = $candidate.author
            $work.background = $candidate.background
            $work.look = $candidate.look
            $work.source = $candidate.source
            $work | Add-Member -NotePropertyName audioLengths -NotePropertyValue @(40) -Force
        } else {
            $work | Add-Member -NotePropertyName audioLengths -NotePropertyValue @(20, 40, 60, 120) -Force
        }
        $work
    } else {
        $id = 'catalog-{0:D4}' -f $nextId
        $nextId++
        [pscustomobject][ordered]@{
            id = $id; title = $candidate.title; author = $candidate.author
            background = $candidate.background; look = $candidate.look
            source = $candidate.source; catalogRank = $candidate.rank
            catalogPriority = $candidate.priority; sourceWorkbook = 'ルーブル音声ガイド_候補200作品.xlsx'
            room = $null; floor = $null; wing = $null
            locationPrecision = 'unknown'; verified = $false
            audioLengths = @(40)
        }
    }
}
$candidateTitles = @{}; foreach ($item in $candidates) { $candidateTitles[$item.title] = $true }
$catalog += @($existing | Where-Object { -not $candidateTitles.ContainsKey($_.title) })
$json = ConvertTo-Json -InputObject @($catalog) -Depth 8
[System.IO.File]::WriteAllText($catalogPath, "$json`n", [System.Text.UTF8Encoding]::new($false))
Write-Output "Imported $($candidates.Count) workbook works; catalog contains $(@($catalog).Count) works."
