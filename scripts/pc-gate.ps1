# The Gate on the PC: "Why now?" right after Windows sign-in and after every unlock (Win+L, wake from sleep).
# Same four choices as the phone: 1 Unlock (urgent, no questions), 2 Fun (your book is offered first, then
# what kind and how long; when the time runs out the Gate asks again), 3 Note (to Inbox), 4 Task (for today).
# Each choice is logged by the LifeOS server (POST /api/gate, choice and numbers only). When the server is
# not running, choices, notes and tasks wait in %LOCALAPPDATA%\LifeOS\gate-pending.jsonl and are sent later.
# Started (and restarted if it stops) by the keeper in pc-app.ps1. Run by hand to try it:
#   powershell -ExecutionPolicy Bypass -File scripts\pc-gate.ps1 -AtStart
param([switch]$AtStart)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$api = if ($env:LIFEOS_GATE_API) { $env:LIFEOS_GATE_API } else { "http://127.0.0.1:4173/api" }  # override only for testing
$dir = Join-Path $env:LOCALAPPDATA "LifeOS"
$pending = Join-Path $dir "gate-pending.jsonl"
$infoFile = Join-Path $dir "gate-info.json"
New-Item -ItemType Directory -Force $dir | Out-Null

# Colours repeat the Oxygen theme (bg, ink, ink-dim, accent CSS variables in globals.css); WinForms cannot read CSS.
$bg = [Drawing.ColorTranslator]::FromHtml("#0B0B0D")
$ink = [Drawing.ColorTranslator]::FromHtml("#F2F2F4")
$dim = [Drawing.ColorTranslator]::FromHtml("#9B9BA3")
$brass = [Drawing.ColorTranslator]::FromHtml("#8AB4FF")  # replaced by the accent from Settings when set
$funTint = [Drawing.ColorTranslator]::FromHtml("#F2A65A")
$noteTint = [Drawing.ColorTranslator]::FromHtml("#6FCF97")
$taskTint = [Drawing.ColorTranslator]::FromHtml("#C58AF9")

$state = @{ step = ""; mode = "unlock"; answered = $true; passed = [datetime]::MinValue; funUntil = [datetime]::MinValue
  funKind = "fun"; funMinutes = 0; ext = 0; locked = $false; lastTick = Get-Date; info = $null }

# ---------- talking to the server (or queueing when it is away) ----------

function Send-Item($path, $body) {
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
    Invoke-RestMethod "$api/$path" -Method Post -Body $bytes -ContentType "application/json; charset=utf-8" -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    # 4xx (bad data) will never be accepted: drop it. No answer or 5xx: keep it.
    $code = $_.Exception.Response.StatusCode.value__
    return ($code -ge 400 -and $code -lt 500)
  }
}

function Send-Queued($path, $body) {
  Send-Pending
  if (-not (Send-Item $path $body)) { (@{ path = $path; body = $body } | ConvertTo-Json -Compress -Depth 4) | Add-Content $pending -Encoding UTF8 }
}

function Send-Pending {
  if (-not (Test-Path $pending)) { return }
  $lines = @(Get-Content $pending -Encoding UTF8 | Where-Object { $_.Trim() })
  $left = @()
  foreach ($line in $lines) {
    $item = $line | ConvertFrom-Json
    if ($left.Count -gt 0 -or -not (Send-Item $item.path $item.body)) { $left += $line }  # keep the order
  }
  if ($left.Count) { Set-Content $pending $left -Encoding UTF8 } else { Remove-Item $pending -ErrorAction SilentlyContinue }
}

function Log-Choice($choice, $kind = $null, $minutes = 0) {
  $e = @{ device = "pc"; choice = $choice; at = (Get-Date).ToString("yyyy-MM-dd HH:mm", [Globalization.CultureInfo]::InvariantCulture) }  # some cultures write 15.45
  if ($kind) { $e.kind = $kind }
  if ($minutes -gt 0) { $e.minutes = $minutes }
  if ($choice -notin @("more", "done")) { $e.via = $state.mode }
  Send-Queued "gate" $e
}

# Settings, the book and today's counts; the last copy is kept so the Gate works with the server down.
function Get-Info {
  try {
    $text = (Invoke-WebRequest "$api/gate" -UseBasicParsing -TimeoutSec 3).Content
    Set-Content $infoFile $text -Encoding UTF8
  } catch {
    $text = if (Test-Path $infoFile) { Get-Content $infoFile -Raw -Encoding UTF8 } else { "{}" }
  }
  $i = $text | ConvertFrom-Json
  if (-not $i.minutes) { $i | Add-Member -Force minutes @(10, 20, 30) }
  if (-not $i.fun) { $i | Add-Member -Force fun @(@{ kind = "videos"; label = "Videos" }, @{ kind = "games"; label = "Games" }, @{ kind = "chat"; label = "Chat" }) }
  if ($null -eq $i.grace) { $i | Add-Member -Force grace 2 }
  return $i
}

# ---------- the window ----------

$form = New-Object Windows.Forms.Form
$form.FormBorderStyle = "None"
$form.WindowState = "Maximized"
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = $bg
$form.KeyPreview = $true
$panel = New-Object Windows.Forms.FlowLayoutPanel
$panel.FlowDirection = "TopDown"
$panel.WrapContents = $false
$panel.AutoSize = $true
$panel.AutoSizeMode = "GrowAndShrink"
$panel.BackColor = [Drawing.Color]::Transparent
$form.Controls.Add($panel)
$form.GetType().GetProperty("DoubleBuffered", [Reflection.BindingFlags]"NonPublic,Instance").SetValue($form, $true)
# A soft glow in the accent colour (top left) and a second one (bottom right), like the phone's wallpaper glow.
$form.add_Paint({
  param($s, $e)
  $g = $e.Graphics
  foreach ($glow in @(@{ c = $brass; a = 70; x = -0.25; y = -0.55; w = 0.9; h = 1.2 }, @{ c = $taskTint; a = 40; x = 0.45; y = 0.35; w = 0.8; h = 1.0 })) {
    $path = New-Object Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse([float]($s.Width * $glow.x), [float]($s.Height * $glow.y), [float]($s.Width * $glow.w), [float]($s.Height * $glow.h))
    $brush = New-Object Drawing.Drawing2D.PathGradientBrush($path)
    $brush.CenterColor = [Drawing.Color]::FromArgb($glow.a, $glow.c)
    $brush.SurroundColors = @([Drawing.Color]::FromArgb(0, $glow.c))
    $g.FillPath($brush, $path)
  }
})
$center = { $panel.Left = [int](($form.ClientSize.Width - $panel.Width) / 2); $panel.Top = [int](($form.ClientSize.Height - $panel.Height) / 2.5) }
$form.add_Resize($center)
$panel.add_SizeChanged($center)

function Add-Text($text, $size = 18, $color = $ink) {
  $l = New-Object Windows.Forms.Label
  $l.Text = $text
  $l.AutoSize = $true
  $l.MaximumSize = New-Object Drawing.Size(680, 0)
  $l.ForeColor = $color
  $l.BackColor = [Drawing.Color]::Transparent
  $l.Font = New-Object Drawing.Font("Segoe UI", $size)
  $l.Margin = New-Object Windows.Forms.Padding(0, 0, 0, 14)
  $panel.Controls.Add($l)
  return $l
}

# A rounded glass card drawn by hand (WinForms has no rounded buttons): an optional key badge in the
# choice's own colour, a title and a one-line meaning. Hover lifts it; click or the key runs it.
$surface = [Drawing.Color]::FromArgb(26, 255, 255, 255)
$surfaceHover = [Drawing.Color]::FromArgb(44, 255, 255, 255)
function New-RoundPath([Drawing.RectangleF]$r, [float]$radius) {
  $p = New-Object Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $p.AddArc($r.X, $r.Y, $d, $d, 180, 90)
  $p.AddArc($r.Right - $d, $r.Y, $d, $d, 270, 90)
  $p.AddArc($r.Right - $d, $r.Bottom - $d, $d, $d, 0, 90)
  $p.AddArc($r.X, $r.Bottom - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}
function Add-Card($parent, [int]$w, [int]$h, $title, $hint, $key, $tint, [scriptblock]$onClick, $value = $null) {
  $c = New-Object Windows.Forms.Panel
  $c.Size = New-Object Drawing.Size($w, $h)
  $c.Margin = New-Object Windows.Forms.Padding(6)
  $c.BackColor = [Drawing.Color]::Transparent
  $c.Cursor = [Windows.Forms.Cursors]::Hand
  $c.GetType().GetProperty("DoubleBuffered", [Reflection.BindingFlags]"NonPublic,Instance").SetValue($c, $true)
  $c.Tag = @{ title = $title; hint = $hint; key = $key; tint = $(if ($tint) { $tint } else { $ink }); hover = $false; action = $onClick; value = $value }
  $c.add_Paint({
    param($s, $e)
    $t = $s.Tag
    $g = $e.Graphics
    $g.SmoothingMode = "AntiAlias"
    $g.TextRenderingHint = "ClearTypeGridFit"
    $rect = New-Object Drawing.RectangleF(1, 1, ($s.Width - 3), ($s.Height - 3))
    $path = New-RoundPath $rect 18
    $fill = New-Object Drawing.SolidBrush($(if ($t.hover) { $surfaceHover } else { $surface }))
    $g.FillPath($fill, $path)
    $line = New-Object Drawing.Pen($(if ($t.hover) { $t.tint } else { [Drawing.Color]::FromArgb(40, 255, 255, 255) }), 1.5)
    $g.DrawPath($line, $path)
    $x = 22
    if ($t.key) {
      $badge = New-RoundPath (New-Object Drawing.RectangleF(20, (($s.Height - 44) / 2), 44, 44)) 12
      $g.FillPath((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(60, $t.tint))), $badge)
      $f = New-Object Drawing.Font("Segoe UI Semibold", 17)
      $sz = $g.MeasureString($t.key, $f)
      $g.DrawString($t.key, $f, (New-Object Drawing.SolidBrush($t.tint)), (42 - $sz.Width / 2), (($s.Height - $sz.Height) / 2))
      $x = 80
    }
    $titleFont = New-Object Drawing.Font("Segoe UI Semibold", $(if ($t.hint) { 17 } else { 15 }))
    $tsz = $g.MeasureString($t.title, $titleFont)
    $ty = if ($t.hint) { ($s.Height / 2) - $tsz.Height + 4 } else { ($s.Height - $tsz.Height) / 2 }
    $g.DrawString($t.title, $titleFont, (New-Object Drawing.SolidBrush($ink)), $x, $ty)
    if ($t.hint) { $g.DrawString($t.hint, (New-Object Drawing.Font("Segoe UI", 10.5)), (New-Object Drawing.SolidBrush($dim)), ($x + 1), (($s.Height / 2) + 4)) }
  })
  $c.add_MouseEnter({ $this.Tag.hover = $true; $this.Invalidate() })
  $c.add_MouseLeave({ $this.Tag.hover = $false; $this.Invalidate() })
  $c.add_Click({ & $this.Tag.action })
  $parent.Controls.Add($c)
  return $c
}
# A full-width card for the later steps (kinds of fun, lengths, Save, Back).
function Add-Button($text, [scriptblock]$onClick, $value = $null) {
  return Add-Card $panel 684 60 $text $null $null $null $onClick $value
}

function Clear-Step($step) {
  $state.step = $step
  $panel.Controls.Clear()
}

function Close-Gate($choice, $kind = $null, $minutes = 0) {
  $state.answered = $true
  $state.passed = Get-Date
  $form.Hide()
  Log-Choice $choice $kind $minutes
}

# ---------- the steps ----------

function Show-Dial {
  Clear-Step "dial"
  Add-Text "Why now?" 30 | Out-Null
  $t = $state.info.today
  if ($t) { Add-Text "Today: $($t.gates) unlocks, $($t.fun) for fun" 12 $dim | Out-Null }
  Add-Text "Press a key, or click" 11 $dim | Out-Null
  # Four different choices, each with its own key and colour, two by two.
  $grid = New-Object Windows.Forms.FlowLayoutPanel
  $grid.Width = 700
  $grid.Height = 290
  $grid.BackColor = [Drawing.Color]::Transparent
  $grid.Margin = New-Object Windows.Forms.Padding(-6, 6, 0, 0)
  $panel.Controls.Add($grid)
  Add-Card $grid 336 130 "Unlock" "Urgent: straight in" "1" $brass { Close-Gate "unlock" } | Out-Null
  Add-Card $grid 336 130 "Fun" "Your book first, then a timer" "2" $funTint { Show-Suggest } | Out-Null
  Add-Card $grid 336 130 "Note" "Jot it down, then go" "3" $noteTint { Show-Write $true } | Out-Null
  Add-Card $grid 336 130 "Task" "Add it to today, then go" "4" $taskTint { Show-Write $false } | Out-Null
}

function Show-Write([bool]$note) {
  Clear-Step "write"
  $state.note = $note
  Add-Text $(if ($note) { "Quick note (goes to your Inbox)" } else { "New task for today" }) 22 | Out-Null
  $box = New-Object Windows.Forms.TextBox
  $box.Width = 684
  $box.Font = New-Object Drawing.Font("Segoe UI", 15)
  $box.BackColor = $bg
  $box.ForeColor = $ink
  $box.Margin = New-Object Windows.Forms.Padding(0, 0, 0, 14)
  $panel.Controls.Add($box)
  $state.box = $box
  $box.add_KeyDown({ if ($_.KeyCode -eq "Enter") { $_.SuppressKeyPress = $true; Save-Write } })
  Add-Button "Save  (Enter)" { Save-Write } | Out-Null
  Add-Button "Back  (Esc)" { Show-Dial } | Out-Null
  $box.Focus() | Out-Null
}

function Save-Write {
  $text = $state.box.Text.Trim()
  if (-not $text) { return }
  if ($state.note) { Send-Queued "capture" @{ kind = "inbox"; text = $text } } else { Send-Queued "task" @{ text = $text; date = (Get-Date -Format "yyyy-MM-dd") } }
  Close-Gate $(if ($state.note) { "note" } else { "task" })
}

function Show-Suggest {
  Clear-Step "suggest"
  Add-Text "Read instead?" 30 | Out-Null
  $b = $state.info.book
  if ($b) { Add-Text "$($b.title)$(if ($b.pages) { "`npage $($b.progress) of $($b.pages)" })" | Out-Null }
  else { Add-Text "10 pages of any book, or just sit with being bored for a minute." | Out-Null }
  if ($null -ne $state.info.bank) { Add-Text "Game time banked: $($state.info.bank) min. Reading earns more." 12 $dim | Out-Null }
  Add-Button "Read 10 pages  (locks the PC)" { Close-Gate "read"; rundll32.exe user32.dll,LockWorkStation } | Out-Null
  Add-Button "Still fun" { Show-Kinds } | Out-Null
}

function Show-Kinds {
  Clear-Step "kinds"
  Add-Text "What kind of fun?" 26 | Out-Null
  foreach ($k in $state.info.fun) { Add-Button $k.label { Show-Length $this.Tag.value } $k.kind | Out-Null }
  Add-Button "Back  (Esc)" { Show-Dial } | Out-Null
}

function Show-Length($kind) {
  Clear-Step "length"
  Add-Text "For how long?" 26 | Out-Null
  Add-Text "When it runs out, the Gate asks again." 12 $dim | Out-Null
  $state.funKind = $kind
  foreach ($m in $state.info.minutes) { Add-Button "$m min" { Start-Pause 5 $state.funKind ([int]$this.Tag.value) $false } ([int]$m) | Out-Null }
  Add-Button "Back  (Esc)" { Show-Kinds } | Out-Null
}

function Start-Fun($kind, [int]$minutes, [bool]$extension) {
  $state.funKind = $kind
  $state.funUntil = (Get-Date).AddMinutes($minutes)
  $state.funMinutes = if ($extension) { $state.funMinutes + $minutes } else { $minutes }
  $state.ext = if ($extension) { $state.ext + 1 } else { 0 }
  if ($extension) { Close-Gate "more" $null $minutes } else { Close-Gate "fun" $kind $minutes }
}

function Show-TimeUp {
  Clear-Step "timeup"
  $state.mode = "timeup"
  Add-Text "Time's up" 30 | Out-Null
  Add-Text "$($state.funMinutes) min of $($state.funKind)." | Out-Null
  Add-Button "Done" { $state.funUntil = [datetime]::MinValue; Close-Gate "done" } | Out-Null
  Add-Button "10 more" { Start-Pause $(if ($state.ext -eq 0) { 15 } else { 30 }) $state.funKind 10 $true } | Out-Null
}

# A short wait before fun starts (5 s), longer for each extension (15 s, then 30 s).
$pauseTimer = New-Object Windows.Forms.Timer
$pauseTimer.Interval = 1000
$pause = @{ left = 0; kind = ""; minutes = 0; extension = $false; label = $null }
$pauseTimer.add_Tick({
  $pause.left--
  if ($pause.left -le 0) { $pauseTimer.Stop(); Start-Fun $pause.kind $pause.minutes $pause.extension; return }
  $pause.label.Text = "Fun in $($pause.left) s"
})
function Start-Pause([int]$seconds, $kind, [int]$minutes, [bool]$extension) {
  Clear-Step "pause"
  Add-Text "Breathe" 30 | Out-Null
  $pause.left = $seconds
  $pause.kind = $kind
  $pause.minutes = $minutes
  $pause.extension = $extension
  $pause.label = Add-Text "Fun in $seconds s"
  Add-Button "Never mind" { $pauseTimer.Stop(); if ($state.mode -eq "timeup") { $state.funUntil = [datetime]::MinValue; Close-Gate "done" } else { Show-Dial } } | Out-Null
  $pauseTimer.Start()
}

function Show-Gate($mode) {
  $state.info = Get-Info
  if ($state.info.pc -eq $false) { return }
  if ($state.info.accent) { $script:brass = [Drawing.ColorTranslator]::FromHtml($state.info.accent) }  # the accent picked in Settings
  $state.mode = $mode
  $state.answered = $false
  if ($mode -eq "timeup") { Show-TimeUp } else { Show-Dial }
  $form.Show()
  $form.Activate()
}

$form.add_KeyDown({
  if ($state.step -eq "dial") {
    switch ($_.KeyCode) { "D1" { Close-Gate "unlock" } "D2" { Show-Suggest } "D3" { Show-Write $true } "D4" { Show-Write $false } }
  } elseif ($_.KeyCode -eq "Escape" -and $state.step -ne "pause" -and $state.step -ne "timeup") { Show-Dial }
})
# Alt+F4 hides the Gate (counted as a skip); it stays running for the next unlock.
$form.add_FormClosing({
  param($s, $e)
  if ($e.CloseReason -eq "UserClosing") {
    $e.Cancel = $true
    $pauseTimer.Stop()
    if (-not $state.answered) { if ($state.mode -eq "timeup") { $state.funUntil = [datetime]::MinValue }; Close-Gate "skip" }
  }
})

# ---------- watching for unlocks ----------
# Every second: the lock screen (LogonUI) going away means an unlock; a long gap between ticks means the PC
# slept. Polling avoids Windows session events, which PowerShell cannot handle on their own thread.
$watch = New-Object Windows.Forms.Timer
$watch.Interval = 1000
$watch.add_Tick({
  $now = Get-Date
  $slept = ($now - $state.lastTick).TotalSeconds -gt 90
  $state.lastTick = $now
  $locked = [bool](Get-Process LogonUI -ErrorAction SilentlyContinue)
  $unlocked = $state.locked -and -not $locked
  $state.locked = $locked
  if ($unlocked -and $form.Visible) { $form.Activate() }  # prepared while locked: take the keyboard now
  if ($form.Visible) { return }
  $funOn = $state.funUntil -gt $now
  if ($state.funUntil -ne [datetime]::MinValue -and -not $funOn) {
    $state.funUntil = [datetime]::MinValue
    if (-not $locked -and -not $unlocked -and -not $slept) { Show-Gate "timeup"; return }  # ran out while you were here
  }
  # The Gate is made ready behind the lock screen, so it is already there the moment you unlock.
  if (($locked -or $unlocked -or $slept) -and -not $funOn) {
    $grace = [double]$(if ($state.info) { $state.info.grace } else { 2 })
    if (($now - $state.passed).TotalMinutes -ge $grace) { Show-Gate "unlock" }
  }
})
$watch.Start()

if ($AtStart) { Show-Gate "start" }
[Windows.Forms.Application]::Run()
