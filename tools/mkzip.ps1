# Pack site/ into a zip whose entry names use forward slashes.
#
# Compress-Archive writes them with backslashes, which the ZIP spec does not
# allow. Most tools cope; an unzipper that does not will treat
# "functions\_middleware.js" as one flat filename and the gate will never run
# — the site would go up wide open. Not worth the risk for four lines.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Join-Path (Split-Path $PSScriptRoot -Parent) "site"
$zip  = Join-Path (Split-Path $PSScriptRoot -Parent) "flowlist-site.zip"
if (Test-Path $zip) { Remove-Item $zip }
$a = [System.IO.Compression.ZipFile]::Open($zip, "Create")
Get-ChildItem -Path $root -Recurse -File | ForEach-Object {
  $name = $_.FullName.Substring($root.Length + 1).Replace("\", "/")
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($a, $_.FullName, $name) | Out-Null
}
$a.Dispose()
[System.IO.Compression.ZipFile]::OpenRead($zip).Entries | ForEach-Object { $_.FullName }
