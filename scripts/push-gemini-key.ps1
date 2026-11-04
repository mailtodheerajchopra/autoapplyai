# One-off helper: add GEMINI_API_KEY to Vercel production, reading the
# exact value out of .env so nothing in this chat mangles it.
$ErrorActionPreference = 'Continue'
$loaded = @{}
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)=(.*)$') { $loaded[$matches[1]] = $matches[2].Trim('"') }
}
$k = 'GEMINI_API_KEY'
$v = $loaded[$k]
if ([string]::IsNullOrWhiteSpace($v)) { Write-Output 'SKIP: GEMINI_API_KEY empty in .env'; return }
Write-Output ('key length: ' + $v.Length + ', prefix: ' + $v.Substring(0, 3))
$v | vercel.cmd env add $k production --force 2>$null | Out-Null
Write-Output ('vercel env add exit code: ' + $LASTEXITCODE)
vercel.cmd env ls production 2>$null | Select-String -Pattern 'GEMINI' | ForEach-Object { ($_.ToString() -split '\s+')[0..1] -join ' ' }
