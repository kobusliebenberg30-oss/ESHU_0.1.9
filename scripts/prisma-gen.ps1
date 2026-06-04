Set-Location 'c:\Users\Kobus Liebenberg\Music\ESHU_0.1.6\server'
$out = node node_modules\prisma\build\index.js generate 2>&1
$out | Out-File 'c:\Users\Kobus Liebenberg\Music\ESHU_0.1.6\prisma-gen.log' -Encoding utf8
