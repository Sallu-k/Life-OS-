# The Gate on the PC: "Why now?" right after Windows sign-in and after every unlock (Win+L, wake from sleep).
# The same choices as the phone: Purpose (right arrow, urgent, straight in), Leisure (left arrow: a fact
# first, or "Continue my book" which opens the book reader, then what kind and how long; when the time runs
# out the Gate asks again), Note (N, to the Inbox) and Task (T, for today). Keys 1-4 still work too.
# Each choice is logged by the LifeOS server (POST /api/gate, choice and numbers only). When the server is
# not running, choices, notes and tasks wait in %LOCALAPPDATA%\LifeOS\gate-pending.jsonl and are sent later.
# Started (and restarted if it stops) by the keeper in pc-app.ps1. Run by hand to try it:
#   powershell -ExecutionPolicy Bypass -File scripts\pc-gate.ps1 -AtStart
# To check the design without showing it or logging anything, save a picture of each step:
#   powershell -ExecutionPolicy Bypass -File scripts\pc-gate.ps1 -Shot C:\some\folder
# This file stays plain ASCII (Windows PowerShell reads it as ANSI): symbols are written as [char] codes.
param([switch]$AtStart, [string]$Shot)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$api = if ($env:LIFEOS_GATE_API) { $env:LIFEOS_GATE_API } else { "http://127.0.0.1:4173/api" }  # override only for testing
$site = $api -replace "/api$", ""
$dir = Join-Path $env:LOCALAPPDATA "LifeOS"
$pending = Join-Path $dir "gate-pending.jsonl"
$infoFile = Join-Path $dir "gate-info.json"
New-Item -ItemType Directory -Force $dir | Out-Null

# Colours repeat the Oxygen theme (bg, ink, ink-dim, accent CSS variables in globals.css); WinForms cannot read CSS.
$bg = [Drawing.ColorTranslator]::FromHtml("#0B0B0D")
$ink = [Drawing.ColorTranslator]::FromHtml("#F2F2F4")
$dim = [Drawing.ColorTranslator]::FromHtml("#9B9BA3")
$brass = [Drawing.ColorTranslator]::FromHtml("#8AB4FF")  # Purpose; replaced by the accent from Settings when set
$funTint = [Drawing.ColorTranslator]::FromHtml("#F2A65A")
$noteTint = [Drawing.ColorTranslator]::FromHtml("#6FCF97")
$taskTint = [Drawing.ColorTranslator]::FromHtml("#C58AF9")
$fieldBg = [Drawing.ColorTranslator]::FromHtml("#1C1C21")  # a text box on the glass surface

$right = [char]0x2192
$left = [char]0x2190
$dot = [char]0x00B7

$state = @{ step = ""; mode = "unlock"; answered = $true; passed = [datetime]::MinValue; funUntil = [datetime]::MinValue
  funKind = "fun"; funMinutes = 0; ext = 0; locked = $false; lastTick = Get-Date; info = $null; fact = $null
  urgentUntil = [datetime]::MinValue; nightNote = $false; more = 10; ytPass = [datetime]::MinValue; warned = $null
  funDay = ""; funCounts = @{}; fits = @(); revealed = $false; greyByUs = $false; greyAt = [datetime]::MinValue }

# ---------- talking to the server (or queueing when it is away) ----------

function Send-Item($path, $body) {
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress -Depth 6))
    Invoke-RestMethod "$api/$path" -Method Post -Body $bytes -ContentType "application/json; charset=utf-8" -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    # 4xx (bad data) will never be accepted: drop it. No answer or 5xx: keep it.
    $code = $_.Exception.Response.StatusCode.value__
    return ($code -ge 400 -and $code -lt 500)
  }
}

function Send-Queued($path, $body) {
  if ($Shot) { return }  # pictures only: nothing is sent or logged
  Send-Pending
  if (-not (Send-Item $path $body)) { (@{ path = $path; body = $body } | ConvertTo-Json -Compress -Depth 8) | Add-Content $pending -Encoding UTF8 }
}

function Send-Pending {
  if (-not (Test-Path $pending)) { return }
  $lines = @(Get-Content $pending -Encoding UTF8 | Where-Object { $_.Trim() })
  $keep = @()
  foreach ($line in $lines) {
    $item = $line | ConvertFrom-Json
    if ($keep.Count -gt 0 -or -not (Send-Item $item.path $item.body)) { $keep += $line }  # keep the order
  }
  if ($keep.Count) { Set-Content $pending $keep -Encoding UTF8 } else { Remove-Item $pending -ErrorAction SilentlyContinue }
}

function Now-Stamp { return (Get-Date).ToString("yyyy-MM-dd HH:mm", [Globalization.CultureInfo]::InvariantCulture) }  # some cultures write 15.45

function Log-Choice($choice, $kind = $null, $minutes = 0) {
  $e = @{ device = "pc"; choice = $choice; at = (Now-Stamp) }
  if ($kind) { $e.kind = $kind }
  if ($minutes -gt 0) { $e.minutes = $minutes }
  if ($choice -notin @("more", "done") -and $state.mode -in @("unlock", "start", "app", "still")) { $e.via = $(if ($state.mode -eq "still") { "app" } else { $state.mode }) }  # the log knows only these
  Send-Queued "gate" $e
}

# ---------- night lock (gate.night { from, until } in Settings) ----------
# After "from" there is no leisure and no Purpose: Sleep (lock), Shut down, a note for tomorrow, or Urgent
# (say what, wait a minute, then 15 minutes). The Gate comes back while the PC is in use, not only on unlock.
function Get-MinuteOfDay($hhmm) { if ("$hhmm" -match "^(\d\d):(\d\d)$") { return [int]$matches[1] * 60 + [int]$matches[2] } return -1 }
function Get-NightFrom {
  $n = $state.info.night
  if ($null -eq $n) { return $null }  # off until it is set in Settings
  if ((Get-MinuteOfDay $n.from) -lt 0) { return $null }  # switched off
  return $n.from
}
function Test-Night {
  $from = Get-NightFrom
  if (-not $from) { return $false }
  $f = Get-MinuteOfDay $from
  $u = Get-MinuteOfDay $(if ($state.info.night) { $state.info.night.until } else { "05:00" })
  if ($u -lt 0) { $u = 300 }
  $now = (Get-Date).Hour * 60 + (Get-Date).Minute
  if ($f -lt $u) { return ($now -ge $f -and $now -lt $u) }
  return ($now -ge $f -or $now -lt $u)
}
function Get-MinutesToNight {
  $from = Get-NightFrom
  if (-not $from) { return 1440 }
  if (Test-Night) { return 0 }
  $now = (Get-Date).Hour * 60 + (Get-Date).Minute
  return (((Get-MinuteOfDay $from) - $now) % 1440 + 1440) % 1440
}

# ---------- what is in front: YouTube in Brave, games ----------
# YouTube in Brave counts as leisure: opening it without a leisure timer brings the Gate (Purpose gives a
# 10-minute pass, then "Still for the task?"). Games are not flagged or stopped mid-way: while one runs the
# night Gate waits until it ends. At the night lock, YouTube tabs close (with a warning 10 minutes before).
# Window titles are read in memory only, never saved or sent.
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LifeOSFront {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string Title() { var s = new StringBuilder(512); GetWindowText(GetForegroundWindow(), s, 512); return s.ToString(); }
  public static uint Pid() { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid; }
}
'@
function Get-Front {
  try {
    $p = Get-Process -Id ([LifeOSFront]::Pid()) -ErrorAction Stop
    return @{ name = $p.ProcessName; title = [LifeOSFront]::Title() }
  } catch { return @{ name = ""; title = "" } }
}
function Test-YouTube($front) { return ($front.name -eq "brave" -and $front.title -match "YouTube") }

# Games: every exe Windows' Game Bar knows as a game, plus the usual game folders (launchers excluded).
$gameExes = @{}
try { Get-ChildItem "HKCU:\System\GameConfigStore\Children" -ErrorAction Stop | ForEach-Object { $x = (Get-ItemProperty $_.PSPath).MatchedExeFullPath; if ($x) { $gameExes[$x.ToLower()] = $true } } } catch { }
$gameFolders = '\\steamapps\\common\\|\\riot games\\valorant\\|\\epic games\\(?!launcher|epic online services)|\\xboxgames\\|\\ea games\\|^[a-z]:\\games\\'
# Background helpers that live in game folders but are not games (Wallpaper Engine, overlays, crash handlers).
$notGames = '^(wallpaper(32|64)|eosoverlayrenderer.*|epiconlineservices.*|.*crashhandler.*|.*crashreport.*|steamwebhelper|easyanticheat.*)$'
$gameCheck = @{ at = [datetime]::MinValue; on = $false }
function Test-GameRunning {
  if (((Get-Date) - $gameCheck.at).TotalSeconds -lt 10) { return $gameCheck.on }  # looked at most every 10 s
  $gameCheck.at = Get-Date
  # A game counts only with a window of its own (running in the background is not playing).
  $gameCheck.on = [bool](Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.MainWindowHandle -ne 0 -and $_.ProcessName.ToLower() -notmatch $notGames -and ($gameExes[$_.Path.ToLower()] -or $_.Path.ToLower() -match $gameFolders) } | Select-Object -First 1)
  return $gameCheck.on
}

function Close-YouTubeTab { if (Test-YouTube (Get-Front)) { [Windows.Forms.SendKeys]::SendWait("^w") } }  # only when YouTube is in front

# Grey screen before the night lock: Windows' own colour filter (Settings > Accessibility > Color filters,
# greyscale), switched with its shortcut Win+Ctrl+C from gate.night.grey minutes before the night lock until
# it ends. Switched back to colour only if LifeOS switched it on (a filter you chose yourself stays).
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LifeOSKeys {
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void WinCtrlC() {
    keybd_event(0x5B, 0, 0, UIntPtr.Zero); keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x43, 0, 0, UIntPtr.Zero);
    keybd_event(0x43, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero); keybd_event(0x5B, 0, 2, UIntPtr.Zero);
  }
}
'@
$colorFilter = "HKCU:\Software\Microsoft\ColorFiltering"
function Test-GreyOn { return ((Get-ItemProperty $colorFilter -ErrorAction SilentlyContinue).Active -eq 1) }
function Switch-Grey {
  New-Item -Path $colorFilter -Force -ErrorAction SilentlyContinue | Out-Null
  Set-ItemProperty $colorFilter -Name FilterType -Value 0 -Type DWord  # 0 = greyscale
  Set-ItemProperty $colorFilter -Name HotkeyEnabled -Value 1 -Type DWord
  [LifeOSKeys]::WinCtrlC()
}
function Test-GreyTime {
  $n = $state.info.night
  $from = Get-NightFrom
  if (-not $from -or -not $n -or -not $n.grey) { return $false }
  return ((Test-Night) -or (Get-MinutesToNight) -le [int]$n.grey)
}
function Update-Grey {
  if (((Get-Date) - $state.greyAt).TotalSeconds -lt 30) { return }  # looked at every 30 s: switching back is allowed, briefly
  $state.greyAt = Get-Date
  $want = Test-GreyTime
  $on = Test-GreyOn
  if ($want -and -not $on) { Switch-Grey; $state.greyByUs = $true }
  elseif (-not $want -and $on -and $state.greyByUs) { Switch-Grey; $state.greyByUs = $false }
}


# A Windows notification (10 minutes before the night lock).
$tray = New-Object Windows.Forms.NotifyIcon
$tray.Icon = [Drawing.SystemIcons]::Information
$tray.Text = "LifeOS Gate"
function Show-Warning($title, $text) { $tray.Visible = $true; $tray.ShowBalloonTip(15000, $title, $text, "Info") }

# A fact read on the Gate counts for Knowledge too (spacing brings it back later).
function Log-Fact {
  if ($state.fact -and $state.fact.id -and $state.fact.type -ne "recall") { Send-Queued "knowledge/log" @{ events = @(@{ kind = "read"; id = $state.fact.id; at = (Now-Stamp) }) } }
  $state.fact = $null
}

# Settings, the book and today's counts; the last copy is kept so the Gate works with the server down.
function Get-Info {
  try {
    # Read as UTF-8 (the server sends no charset, so .Content would garble middle dots, accents and non-Latin scripts).
    $r = Invoke-WebRequest "$api/gate" -UseBasicParsing -TimeoutSec 3
    $text = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    if (-not $Shot) { Set-Content $infoFile $text -Encoding UTF8 }
  } catch {
    $text = if (Test-Path $infoFile) { Get-Content $infoFile -Raw -Encoding UTF8 } else { "{}" }
  }
  $i = $text | ConvertFrom-Json
  if (-not $i.minutes) { $i | Add-Member -Force minutes @(10, 20, 30) }
  if (-not $i.fun) { $i | Add-Member -Force fun @(@{ kind = "videos"; label = "Videos" }, @{ kind = "games"; label = "Games" }, @{ kind = "chat"; label = "Chat" }) }
  if ($null -eq $i.grace) { $i | Add-Member -Force grace 2 }
  return $i
}

# ---------- type ----------
# Windows 11's Segoe UI Variable; Segoe UI where it is missing (GDI+ would silently use another font).
function Get-Font($family, [float]$size, $style = "Regular") {
  $f = New-Object Drawing.Font($family, $size, [Drawing.FontStyle]$style)
  if ($f.Name -ne $family) { $f = New-Object Drawing.Font("Segoe UI", $size, [Drawing.FontStyle]$style) }
  return $f
}
$display = "Segoe UI Variable Display"
$displayBold = "Segoe UI Variable Display Semib"
$displayLight = "Segoe UI Variable Display Light"
$textFace = "Segoe UI Variable Text"

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
# Two soft glows (Purpose's colour top left, Leisure's bottom right) and the clock at the top.
$form.add_Paint({
  param($s, $e)
  $g = $e.Graphics
  $g.SmoothingMode = "AntiAlias"
  $g.TextRenderingHint = "AntiAliasGridFit"
  foreach ($glow in @(@{ c = $brass; a = 60; x = -0.25; y = -0.55; w = 0.9; h = 1.2 }, @{ c = $funTint; a = 28; x = 0.5; y = 0.4; w = 0.8; h = 1.0 })) {
    $path = New-Object Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse([float]($s.Width * $glow.x), [float]($s.Height * $glow.y), [float]($s.Width * $glow.w), [float]($s.Height * $glow.h))
    $brush = New-Object Drawing.Drawing2D.PathGradientBrush($path)
    $brush.CenterColor = [Drawing.Color]::FromArgb($glow.a, $glow.c)
    $brush.SurroundColors = @([Drawing.Color]::FromArgb(0, $glow.c))
    $g.FillPath($brush, $path)
  }
  $now = Get-Date
  $time = $now.ToString("HH:mm", [Globalization.CultureInfo]::InvariantCulture)
  $date = $now.ToString("dddd, d MMMM", [Globalization.CultureInfo]::InvariantCulture)
  $tf = Get-Font $displayLight 54
  $df = Get-Font $textFace 13
  $tsz = $g.MeasureString($time, $tf)
  $dsz = $g.MeasureString($date, $df)
  $g.DrawString($time, $tf, (New-Object Drawing.SolidBrush($ink)), (($s.ClientSize.Width - $tsz.Width) / 2), 56)
  $g.DrawString($date, $df, (New-Object Drawing.SolidBrush($dim)), (($s.ClientSize.Width - $dsz.Width) / 2), (60 + $tsz.Height))
})
$center = { $panel.Left = [int](($form.ClientSize.Width - $panel.Width) / 2); $panel.Top = [int]([Math]::Max(200, ($form.ClientSize.Height - $panel.Height) / 2 + 40)) }
$form.add_Resize($center)
$panel.add_SizeChanged($center)

function Add-Text($text, [float]$size = 16, $color = $ink, $face = $textFace, [int]$after = 14) {
  $l = New-Object Windows.Forms.Label
  $l.Text = $text
  $l.AutoSize = $true
  $l.MaximumSize = New-Object Drawing.Size(700, 0)
  $l.ForeColor = $color
  $l.BackColor = [Drawing.Color]::Transparent
  $l.Font = Get-Font $face $size
  $l.UseCompatibleTextRendering = $false
  $l.Margin = New-Object Windows.Forms.Padding(0, 0, 0, $after)
  $panel.Controls.Add($l)
  return $l
}

# A rounded glass tile drawn by hand (WinForms has no rounded buttons): a title, a one-line meaning and a
# key in a small pill at the right. Hover lights it in its own colour; click or the key runs it.
# "primary" fills it with its colour (the main action of a step); "disabled" waits (see Start-Hold).
$surface = [Drawing.Color]::FromArgb(20, 255, 255, 255)
$surfaceHover = [Drawing.Color]::FromArgb(36, 255, 255, 255)
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
function Add-Card($parent, [int]$w, [int]$h, $title, $hint, $key, $tint, [scriptblock]$onClick, $value = $null, [switch]$Primary) {
  $c = New-Object Windows.Forms.Panel
  $c.Size = New-Object Drawing.Size($w, $h)
  $c.Margin = New-Object Windows.Forms.Padding(0, 0, 14, 14)
  $c.BackColor = [Drawing.Color]::Transparent
  $c.Cursor = [Windows.Forms.Cursors]::Hand
  $c.GetType().GetProperty("DoubleBuffered", [Reflection.BindingFlags]"NonPublic,Instance").SetValue($c, $true)
  $c.Tag = @{ title = $title; hint = $hint; key = $key; tint = $(if ($tint) { $tint } else { $ink }); hover = $false; action = $onClick; value = $value; primary = [bool]$Primary; disabled = $false }
  $c.add_Paint({
    param($s, $e)
    $t = $s.Tag
    $g = $e.Graphics
    $g.SmoothingMode = "AntiAlias"
    $g.TextRenderingHint = "AntiAliasGridFit"
    $rect = New-Object Drawing.RectangleF(1, 1, ($s.Width - 3), ($s.Height - 3))
    $path = New-RoundPath $rect ([Math]::Min(24, $s.Height / 2 - 2))
    $lit = $t.hover -and -not $t.disabled
    if ($t.primary) {
      $fill = [Drawing.Color]::FromArgb($(if ($t.disabled) { 70 } elseif ($lit) { 255 } else { 225 }), $t.tint)
      $titleColor = $bg
      $hintColor = [Drawing.Color]::FromArgb(190, $bg)
    } else {
      $fill = $(if ($lit) { $surfaceHover } else { $surface })
      $titleColor = $(if ($t.disabled) { $dim } else { $ink })
      $hintColor = $dim
    }
    $g.FillPath((New-Object Drawing.SolidBrush($fill)), $path)
    if (-not $t.primary) {
      $edge = $(if ($lit) { [Drawing.Color]::FromArgb(200, $t.tint) } else { [Drawing.Color]::FromArgb(28, 255, 255, 255) })
      $g.DrawPath((New-Object Drawing.Pen($edge, 1.5)), $path)
    }
    $big = $t.hint -and $s.Height -ge 110
    if ($big) {
      # a short bar in the tile's colour, like the phone's choice colours
      $bar = New-RoundPath (New-Object Drawing.RectangleF(24, 22, 28, 5)) 2.5
      $g.FillPath((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(230, $t.tint))), $bar)
    }
    $dotted = $t.hint -and -not $big -and -not $t.primary
    $titleFont = Get-Font $displayBold $(if ($big) { 24 } elseif ($t.hint) { 17 } else { 14.5 })
    $tsz = $g.MeasureString($t.title, $titleFont)
    $x = $(if ($dotted) { 42 } else { 22 })
    if ($dotted) {
      # a dot in the tile's colour before the title
      $g.FillEllipse((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(230, $t.tint))), 24, [float](($s.Height / 2) - ($tsz.Height / 2) - 4), 9, 9)
    }
    if ($big) { $ty = $s.Height - $tsz.Height - 46 } elseif ($t.hint) { $ty = ($s.Height / 2) - $tsz.Height + 3 } else { $ty = ($s.Height - $tsz.Height) / 2 }
    $g.DrawString($t.title, $titleFont, (New-Object Drawing.SolidBrush($titleColor)), $x, $ty)
    if ($t.hint) {
      $hf = Get-Font $textFace 11
      $hy = $(if ($big) { $s.Height - 44 } else { ($s.Height / 2) + 3 })
      $g.DrawString($t.hint, $hf, (New-Object Drawing.SolidBrush($hintColor)), ($x + 1), $hy)
    }
    if ($t.key) {
      $kf = Get-Font $textFace 11 "Bold"
      $ksz = $g.MeasureString($t.key, $kf)
      $kw = [Math]::Max(32, $ksz.Width + 14)
      $kx = $s.Width - $kw - 18
      $ky = $(if ($big) { 20 } else { ($s.Height - 30) / 2 })
      $pill = New-RoundPath (New-Object Drawing.RectangleF($kx, $ky, $kw, 30)) 9
      $g.FillPath((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb($(if ($t.primary) { 40 } else { 26 }), $(if ($t.primary) { $bg } else { $ink })))), $pill)
      $g.DrawString($t.key, $kf, (New-Object Drawing.SolidBrush($(if ($t.primary) { $bg } else { $dim }))), ($kx + ($kw - $ksz.Width) / 2), ($ky + (30 - $ksz.Height) / 2))
    }
  })
  $c.add_MouseEnter({ $this.Tag.hover = $true; $this.Invalidate() })
  $c.add_MouseLeave({ $this.Tag.hover = $false; $this.Invalidate() })
  $c.add_Click({ if (-not $this.Tag.disabled) { & $this.Tag.action } })
  $parent.Controls.Add($c)
  return $c
}
# A row of tiles (two side by side, or more for kinds and lengths).
function Add-Row([int]$height) {
  $row = New-Object Windows.Forms.FlowLayoutPanel
  $row.Width = 714
  $row.Height = $height
  $row.BackColor = [Drawing.Color]::Transparent
  $row.Margin = New-Object Windows.Forms.Padding(0)
  $panel.Controls.Add($row)
  return $row
}
# A full-width tile for the later steps.
function Add-Button($text, [scriptblock]$onClick, $value = $null, $key = $null, $hint = $null, $tint = $null, [switch]$Primary) {
  return Add-Card $panel 700 $(if ($hint) { 72 } else { 58 }) $text $hint $key $tint $onClick $value -Primary:$Primary
}

function Clear-Step($step) {
  $holdTimer.Stop()
  $breathTimer.Stop()
  $state.step = $step
  $panel.SuspendLayout()
  $panel.Controls.Clear()
  $panel.ResumeLayout()
}

# Chose not to (turned back, stopped, sleep, read instead): a short warm moment, then the Gate goes.
$momentTimer = New-Object Windows.Forms.Timer
$momentTimer.Interval = 1400
$moment = @{ then = $null }
$momentTimer.add_Tick({ $momentTimer.Stop(); $form.Hide(); if ($moment.then) { & $moment.then } })
function Show-Moment($choice, $message, [scriptblock]$then = $null) {
  if ($state.answered) { return }
  $state.answered = $true
  $state.passed = Get-Date
  Log-Choice $choice
  Clear-Step "moment"
  Add-Text $message 30 $brass $displayBold 0 | Out-Null
  $moment.then = $then
  $momentTimer.Start()
}

function Close-Gate($choice, $kind = $null, $minutes = 0) {
  $state.answered = $true
  $state.passed = Get-Date
  $holdTimer.Stop()
  $breathTimer.Stop()
  $form.Hide()
  Log-Choice $choice $kind $minutes
}

# What the next thing is (the phone shows the same): the next task, else the paper book's pages left.
function Get-Context {
  $i = $state.info
  if ($i.nextTask) { return "Next: $($i.nextTask)" }
  if ($i.book -and $i.book.pages) { return "$($i.book.pages - $i.book.progress) pages left in $($i.book.title)" }
  return $null
}

# ---------- the steps ----------

function Show-Dial {
  Clear-Step "dial"
  $yt = $state.mode -eq "app"
  Add-Text $(if ($yt) { "Opening YouTube" } else { "Why now?" }) 34 $ink $displayBold 6 | Out-Null
  $one = @($state.info.topTasks)[0]
  if ($one) {
    # Your one thing: the most important open task. Click it (or Enter) to do it now; Done (D) ticks it.
    $why = if ($one.overdue) { "overdue" } elseif ($one.deadline) { "has a deadline" } elseif ($one.priority -eq "high") { "high priority" } elseif ($one.time) { "at $($one.time)" } else { "today" }
    Add-Text "Your one thing $dot $why" 12 $dim $textFace 8 | Out-Null
    $row = Add-Row 86
    Add-Card $row 560 72 $one.text "Do it now: straight in, no timer" "Enter" $taskTint { Close-Gate "unlock" } | Out-Null
    Add-Card $row 126 72 "Done" $null "D" $noteTint { Complete-Task } -Primary | Out-Null
  } else {
    $ctx = Get-Context
    Add-Text $(if ($ctx) { $ctx } else { "Pick one. It takes a second." }) 13 $dim $textFace 26 | Out-Null
  }
  # The phone's slider, side by side: Leisure on the left, Purpose on the right.
  $top = Add-Row 196
  Add-Card $top 343 182 "Leisure" "A fact first, then a timer" "$left" $funTint { Show-ReadFirst } | Out-Null
  Add-Card $top 343 182 "Purpose" $(if ($yt) { "For a task: 10 minutes, then it asks again" } else { "Work, study, something that matters" }) "$right" $brass { Select-Purpose } | Out-Null
  $bottom = Add-Row 80
  Add-Card $bottom 343 66 "Note" "Jot it down, then go" "N" $noteTint { Show-Write $true } | Out-Null
  Add-Card $bottom 343 66 "Task" "Add it to today, then go" "T" $taskTint { Show-Write $false } | Out-Null
  if ($yt) { Add-Text "Esc closes YouTube" 11 $dim $textFace 4 | Out-Null }
  $t = $state.info.today
  if ($t) { Add-Text "Today $dot $($t.gates) unlocks $dot $($t.unlock) for purpose $dot $($t.fun) for leisure" 11 $dim $textFace 0 | Out-Null }
}

# Purpose. From YouTube: a 10-minute pass; when it runs out with YouTube still in front, "Still for the task?".
function Select-Purpose {
  if ($state.mode -in @("app", "still")) { $state.ytPass = (Get-Date).AddMinutes(10) }
  Close-Gate "unlock"
}

# Turned back from YouTube (or done): the Gate goes, and so does the YouTube tab.
function Close-YouTube($choice = "back") {
  Close-Gate $choice
  $afterTimer.Start()  # once the Gate is gone and Brave is in front again
}

function Show-Still {
  Clear-Step "still"
  Add-Text "Still for the task?" 34 $ink $displayBold 6 | Out-Null
  Add-Text "10 minutes of YouTube are up." 14 $dim $textFace 24 | Out-Null
  $row = Add-Row 80
  Add-Card $row 224 66 "Yes, 10 more" $null "Y" $brass { Select-Purpose } | Out-Null
  Add-Card $row 224 66 "Task done" $null "D" $noteTint { Show-Moment "done" "Good work." { $afterTimer.Start() } } -Primary | Out-Null
  Add-Card $row 224 66 "Leisure now" $null "L" $funTint { Show-ReadFirst } | Out-Null
}

# Ticks your one thing (sent now, or queued while the server is away) and shows the next one.
function Complete-Task {
  $one = @($state.info.topTasks)[0]
  if (-not $one) { return }
  Send-Queued "task/done" @{ date = $one.date; matchText = $one.text }
  $state.info.topTasks = @(@($state.info.topTasks) | Select-Object -Skip 1)
  Show-Dial
}

function Show-Write([bool]$note) {
  Clear-Step "write"
  $state.note = $note
  Add-Text $(if ($note) { "Quick note" } else { "New task for today" }) 30 $ink $displayBold 4 | Out-Null
  Add-Text $(if ($note) { "It goes to your Inbox (Today $dot Notes)." } else { "It goes on today's list." }) 12 $dim $textFace 18 | Out-Null
  # A text box inside a rounded field (a plain TextBox cannot be rounded).
  $field = New-Object Windows.Forms.Panel
  $field.Size = New-Object Drawing.Size(700, 64)
  $field.Margin = New-Object Windows.Forms.Padding(0, 0, 0, 16)
  $field.BackColor = [Drawing.Color]::Transparent
  $field.add_Paint({
    param($s, $e)
    $e.Graphics.SmoothingMode = "AntiAlias"
    $p = New-RoundPath (New-Object Drawing.RectangleF(1, 1, ($s.Width - 3), ($s.Height - 3))) 18
    $e.Graphics.FillPath((New-Object Drawing.SolidBrush($fieldBg)), $p)
    $e.Graphics.DrawPath((New-Object Drawing.Pen([Drawing.Color]::FromArgb(160, $(if ($state.note) { $noteTint } else { $taskTint })), 1.5)), $p)
  })
  $box = New-Object Windows.Forms.TextBox
  $box.BorderStyle = "None"
  $box.Font = Get-Font $textFace 16
  $box.BackColor = $fieldBg
  $box.ForeColor = $ink
  $box.Width = 656
  $box.Location = New-Object Drawing.Point(22, 18)
  $field.Controls.Add($box)
  $panel.Controls.Add($field)
  $state.box = $box
  $box.add_KeyDown({ if ($_.KeyCode -eq "Enter") { $_.SuppressKeyPress = $true; Save-Write } })
  $row = Add-Row 72
  Add-Card $row 343 58 "Save" $null "Enter" $(if ($note) { $noteTint } else { $taskTint }) { Save-Write } -Primary | Out-Null
  Add-Card $row 343 58 "Back" $null "Esc" $null { Show-Dial } | Out-Null
  $box.Focus() | Out-Null
}

function Save-Write {
  $text = $state.box.Text.Trim()
  if (-not $text) { return }
  if ($state.note) { Send-Queued "capture" @{ kind = "inbox"; text = $text } } else { Send-Queued "task" @{ text = $text; date = (Get-Date -Format "yyyy-MM-dd") } }
  Close-Gate $(if ($state.note) { "note" } else { "task" })
  if ($state.nightNote) { $state.nightNote = $false; rundll32.exe user32.dll,LockWorkStation }  # a note at night, then bed
}

# Leisure: a fact first (as on the phone). "Continue my book" opens the reader instead; "Leisure anyway"
# opens after a few seconds, so the fact is read, not skipped.
$holdTimer = New-Object Windows.Forms.Timer
$holdTimer.Interval = 1000
$hold = @{ left = 0; card = $null; label = "" }
$holdTimer.add_Tick({
  $hold.left--
  if ($hold.left -le 0) {
    $holdTimer.Stop()
    $hold.card.Tag.disabled = $false
    $hold.card.Tag.title = $hold.label
  } else { $hold.card.Tag.title = "$($hold.label)  ($($hold.left))" }
  $hold.card.Invalidate()
})
function Start-Hold($card, [int]$seconds) {
  $hold.card = $card
  $hold.label = $card.Tag.title
  $hold.left = $seconds
  $card.Tag.disabled = $true
  $card.Tag.title = "$($hold.label)  ($seconds)"
  $holdTimer.Start()
}

function Read-Paper { Log-Fact; Show-Moment "read" "Enjoy the book.`nThose minutes are yours again." { rundll32.exe user32.dll,LockWorkStation } }

# A recall question (as on the phone): the question first, the answer on request, then how it went.
function Send-Recall($kind) {
  if ($state.fact -and $state.fact.id) { Send-Queued "knowledge/log" @{ events = @(@{ kind = $kind; id = $state.fact.id; at = (Now-Stamp) }) } }
  $state.recalled = $kind
  $state.fact = $null  # logged: Log-Fact has nothing more to send
  Show-ReadFirst
}

function Show-ReadFirst {
  $k = $state.info.knowledge
  $fact = if ($k -and $k.items) { @($k.items)[0] } else { $null }
  $book = if ($k) { $k.passage } else { $null }
  if (-not $fact -and -not $book -and -not $state.info.book) { Show-Kinds; return }
  $again = $state.step -eq "read"  # redrawn after Show answer / Knew it: keep the state
  Clear-Step "read"
  if (-not $again) { $state.fact = $fact; $state.revealed = $false; $state.recalled = $null }
  if ($fact) {
    $recall = $fact.type -eq "recall" -and $fact.q
    Add-Text $(if ($recall) { "Do you remember?" } else { "A fact first" }) 12 $dim $textFace 4 | Out-Null
    if ($recall) {
      Add-Text $fact.q 26 $ink $displayBold 10 | Out-Null
      if (-not $state.revealed) {
        Add-Button "Show answer" { $state.revealed = $true; Show-ReadFirst } $null "A" $null $noteTint | Out-Null
      } else {
        Add-Text $fact.a 16 $ink $textFace 10 | Out-Null
        if ($state.recalled) {
          Add-Text $(if ($state.recalled -eq "knew") { "Good. It comes back in a while." } else { "It comes back sooner, until it sticks." }) 12 $noteTint $textFace 12 | Out-Null
        } else {
          $row = Add-Row 72
          Add-Card $row 343 58 "Knew it" $null "K" $noteTint { Send-Recall "knew" } | Out-Null
          Add-Card $row 343 58 "Not yet" $null "X" $taskTint { Send-Recall "notyet" } | Out-Null
        }
      }
    } else {
      Add-Text $fact.title 26 $ink $displayBold 10 | Out-Null
      Add-Text $fact.text 16 $ink $textFace 10 | Out-Null
    }
    if ($fact.source) { Add-Text $fact.source 11 $dim $textFace 22 | Out-Null } else { Add-Text "" 4 $dim $textFace 12 | Out-Null }
  } else {
    Add-Text "Read first?" 34 $ink $displayBold 22 | Out-Null
  }
  if ($book) {
    $where = if ($book.chapter) { "$($book.title) $dot $($book.chapter)" } else { $book.title }
    Add-Button "Continue my book" { Log-Fact; Close-Gate "read"; Start-Process "$site/read/" } $null "B" $where $brass -Primary | Out-Null
  }
  if ($state.info.book) {
    Add-Button "Read 10 pages of $($state.info.book.title)" { Read-Paper } $null "P" "A paper book: the PC locks while you read" $noteTint | Out-Null
  }
  $anyway = Add-Button "Leisure anyway" { Log-Fact; Show-LeisureKinds } $null $left $null $funTint
  if ($fact -and -not $again) { Start-Hold $anyway ([Math]::Min(12, [Math]::Max(4, [int]("$($fact.text)$($fact.q)".Length / 60) * 2 + 2))) }
  Add-Text "Esc goes back" 10.5 $dim $textFace 0 | Out-Null
}

# From YouTube the kind is already known (videos); otherwise ask.
function Show-LeisureKinds { if ($state.mode -in @("app", "still")) { Show-Length "videos" } else { Show-Kinds } }

function Show-Kinds {
  Clear-Step "kinds"
  Add-Text "What kind of leisure?" 30 $ink $displayBold 22 | Out-Null
  $row = Add-Row 0
  $row.AutoSize = $true
  $row.MaximumSize = New-Object Drawing.Size(714, 0)
  $n = 1
  foreach ($k in $state.info.fun) { Add-Card $row 224 72 $k.label $null "$n" $funTint { Show-Length $this.Tag.value } $k.kind | Out-Null; $n++ }
  Add-Button "Back" { Show-Dial } $null "Esc" | Out-Null
}

function Show-Length($kind) {
  Clear-Step "length"
  Add-Text "For how long?" 30 $ink $displayBold 4 | Out-Null
  Add-Text "When it runs out, the Gate asks again." 12 $dim $textFace 22 | Out-Null
  $state.funKind = $kind
  # Leisure ends when the night lock starts: only lengths that fit (or what is left, if at least 5 min).
  $leftMin = Get-MinutesToNight
  $fits = @(@($state.info.minutes) | Where-Object { [int]$_ -le $leftMin })
  if (-not $fits.Count -and $leftMin -ge 5) { $fits = @($leftMin) }
  if (-not $fits.Count) { Show-Night; return }
  $state.fits = $fits
  if ($leftMin -lt 60) { Add-Text "Night lock at $(Get-NightFrom): $leftMin min left." 12 $funTint $textFace 12 | Out-Null }
  $row = Add-Row 0
  $row.AutoSize = $true
  $row.MaximumSize = New-Object Drawing.Size(714, 0)
  $n = 1
  $wait = Get-FunPause $kind
  if ($wait -gt 5) { Add-Text "Leisure again today: a $wait s breath first." 12 $dim $textFace 12 | Out-Null }
  foreach ($m in $fits) { Add-Card $row 224 72 "$m min" $null "$n" $funTint { Start-Pause (Get-FunPause $state.funKind) $state.funKind ([int]$this.Tag.value) $false } ([int]$m) | Out-Null; $n++ }
  Add-Button "Back" { Show-Kinds } $null "Esc" | Out-Null
}

# The pause before leisure grows each time the same kind is started again today: 5 s, then 10, 20, 40 s.
function Get-FunPause($kind) {
  $day = (Get-Date).ToString("yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
  if ($state.funDay -ne $day) { $state.funDay = $day; $state.funCounts = @{} }
  $n = [int]$state.funCounts[$kind]
  return [Math]::Min(40, 5 * [Math]::Pow(2, [Math]::Min(3, $n)))
}
function Add-FunCount($kind) { $state.funCounts[$kind] = [int]$state.funCounts[$kind] + 1 }

function Start-Fun($kind, [int]$minutes, [bool]$extension) {
  if (-not $extension) { Add-FunCount $kind }
  $state.funKind = $kind
  $state.funUntil = (Get-Date).AddMinutes($minutes)
  $state.funMinutes = if ($extension) { $state.funMinutes + $minutes } else { $minutes }
  $state.ext = if ($extension) { $state.ext + 1 } else { 0 }
  if ($extension) { Close-Gate "more" $null $minutes } else { Close-Gate "fun" $kind $minutes }
}

function Show-TimeUp {
  Clear-Step "timeup"
  $state.mode = "timeup"
  Add-Text "Time's up" 34 $ink $displayBold 6 | Out-Null
  Add-Text "$($state.funMinutes) min of $($state.funKind)." 14 $dim $textFace 24 | Out-Null
  $row = Add-Row 80
  Add-Card $row 343 66 "Done" "Back to what matters" "D" $brass { $state.funUntil = [datetime]::MinValue; Show-Moment "done" "Good stop." { $afterTimer.Start() } } -Primary | Out-Null
  $state.more = [Math]::Min(10, (Get-MinutesToNight))  # never past the night lock
  if ($state.more -ge 5) { Add-Card $row 343 66 "$($state.more) more" "After a longer breath" "M" $funTint { Start-Pause $(if ($state.ext -eq 0) { 15 } else { 30 }) $state.funKind $state.more $true } | Out-Null }
}

function Show-Night {
  Clear-Step "night"
  Add-Text "Time to sleep" 34 $ink $displayBold 6 | Out-Null
  Add-Text "After $(Get-NightFrom) sleep comes first. Tomorrow starts tonight." 14 $dim $textFace 24 | Out-Null
  $row = Add-Row 196
  Add-Card $row 343 182 "Sleep" "Lock the PC and go to bed" "L" $brass { Show-Moment "back" "Good night.`nSleep well." { rundll32.exe user32.dll,LockWorkStation } } | Out-Null
  Add-Card $row 343 182 "Shut down" "In one minute (shutdown /a cancels)" "S" $noteTint { Close-Gate "back"; shutdown.exe /s /t 60 /c "LifeOS: good night." } | Out-Null
  $row2 = Add-Row 80
  Add-Card $row2 343 66 "Note for tomorrow" "Then the PC locks" "N" $noteTint { $state.nightNote = $true; Show-Write $true } | Out-Null
  Add-Card $row2 343 66 "Urgent" "Say what, wait a minute, 15 min" "U" $taskTint { Show-Urgent } | Out-Null
}

function Show-Urgent {
  Clear-Step "urgent"
  Add-Text "What is urgent?" 30 $ink $displayBold 4 | Out-Null
  Add-Text "A few words (never saved). Then a minute's pause, then 15 minutes." 12 $dim $textFace 18 | Out-Null
  $box = New-Object Windows.Forms.TextBox
  $box.BorderStyle = "None"
  $box.Font = Get-Font $textFace 16
  $box.BackColor = $fieldBg
  $box.ForeColor = $ink
  $box.Width = 700
  $box.Margin = New-Object Windows.Forms.Padding(0, 0, 0, 16)
  $panel.Controls.Add($box)
  $state.box = $box
  $row = Add-Row 72
  $go = Add-Card $row 343 58 "Continue" $null "Enter" $taskTint { Start-Urgent } -Primary
  $go.Tag.disabled = $true
  $state.go = $go
  Add-Card $row 343 58 "Back" $null "Esc" $null { Show-Night } | Out-Null
  $box.add_TextChanged({ $state.go.Tag.disabled = $state.box.Text.Trim().Length -lt 12; $state.go.Invalidate() })
  $box.add_KeyDown({ if ($_.KeyCode -eq "Enter") { $_.SuppressKeyPress = $true; if (-not $state.go.Tag.disabled) { Start-Urgent } } })
  $box.Focus() | Out-Null
}

function Start-Urgent {
  Start-Pause 60 "urgent" 15 $false "Opening in" { $state.urgentUntil = (Get-Date).AddMinutes(15); Close-Gate "unlock" "urgent" 15 }
}

# A breath before leisure starts (5 s), longer for each extension (15 s, then 30 s): a circle that grows
# as you breathe in and shrinks as you breathe out (4 s each way).
$pauseTimer = New-Object Windows.Forms.Timer
$pauseTimer.Interval = 1000
$pause = @{ left = 0; kind = ""; minutes = 0; extension = $false; label = $null; started = Get-Date; ring = $null; text = "Leisure in"; then = $null }
$pauseTimer.add_Tick({
  $pause.left--
  if ($pause.left -le 0) { $pauseTimer.Stop(); if ($pause.then) { & $pause.then } else { Start-Fun $pause.kind $pause.minutes $pause.extension }; return }
  $pause.label.Text = "$($pause.text) $($pause.left) s"
})
$breathTimer = New-Object Windows.Forms.Timer
$breathTimer.Interval = 33
$breathTimer.add_Tick({ if ($pause.ring) { $pause.ring.Invalidate() } })
# Turning back from the breath: at night back to the night screen; after time's up a good stop; else a
# turned-back moment (the YouTube tab closes too).
function Stop-Pause {
  $pauseTimer.Stop()
  if ($pause.then) { Show-Night }
  elseif ($state.mode -eq "timeup") { $state.funUntil = [datetime]::MinValue; Show-Moment "done" "Good stop." { $afterTimer.Start() } }
  else { Show-Moment "back" "You turned back.`nThat time stays yours." { $afterTimer.Start() } }
}

# $text and $then: an urgent pass at night uses the same breath ("Opening in", then the pass).
function Start-Pause([int]$seconds, $kind, [int]$minutes, [bool]$extension, $text = "Leisure in", [scriptblock]$then = $null) {
  Clear-Step "pause"
  $pause.left = $seconds
  $pause.kind = $kind
  $pause.minutes = $minutes
  $pause.extension = $extension
  $pause.text = $text
  $pause.then = $then
  $pause.started = Get-Date
  $ring = New-Object Windows.Forms.Panel
  $ring.Size = New-Object Drawing.Size(700, 260)
  $ring.BackColor = [Drawing.Color]::Transparent
  $ring.GetType().GetProperty("DoubleBuffered", [Reflection.BindingFlags]"NonPublic,Instance").SetValue($ring, $true)
  $ring.add_Paint({
    param($s, $e)
    $g = $e.Graphics
    $g.SmoothingMode = "AntiAlias"
    $t = ((Get-Date) - $pause.started).TotalSeconds
    $phase = (1 - [Math]::Cos($t * [Math]::PI / 4)) / 2   # 0..1..0 every 8 s
    $r = 60 + 60 * $phase
    $cx = $s.Width / 2
    $cy = $s.Height / 2
    $g.FillEllipse((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb([int](30 + 40 * $phase), $funTint))), [float]($cx - $r), [float]($cy - $r), [float](2 * $r), [float](2 * $r))
    $g.DrawEllipse((New-Object Drawing.Pen([Drawing.Color]::FromArgb(200, $funTint), 2)), [float]($cx - $r), [float]($cy - $r), [float](2 * $r), [float](2 * $r))
    $word = $(if ([Math]::Sin($t * [Math]::PI / 4) -ge 0) { "Breathe in" } else { "Breathe out" })
    $f = Get-Font $display 15
    $sz = $g.MeasureString($word, $f)
    $g.DrawString($word, $f, (New-Object Drawing.SolidBrush($ink)), ($cx - $sz.Width / 2), ($cy - $sz.Height / 2))
  })
  $panel.Controls.Add($ring)
  $pause.ring = $ring
  $pause.label = Add-Text "$text $seconds s" 14 $dim $textFace 20
  Add-Button "Never mind" { Stop-Pause } $null "Esc" | Out-Null
  $pauseTimer.Start()
  $breathTimer.Start()
}

# Closes the YouTube tab half a second after the Gate goes (Brave is in front again by then).
$afterTimer = New-Object Windows.Forms.Timer
$afterTimer.Interval = 500
$afterTimer.add_Tick({ $afterTimer.Stop(); Close-YouTubeTab })

# Fades in, like the phone's Gate.
$fadeTimer = New-Object Windows.Forms.Timer
$fadeTimer.Interval = 15
$fadeTimer.add_Tick({ if ($form.Opacity -ge 0.99) { $form.Opacity = 1; $fadeTimer.Stop() } else { $form.Opacity = [Math]::Min(1, $form.Opacity + 0.08) } })

function Show-Gate($mode) {
  $state.info = Get-Info
  if ($state.info.pc -eq $false) { return }
  if ($state.info.accent) { $script:brass = [Drawing.ColorTranslator]::FromHtml($state.info.accent) }  # the accent picked in Settings
  $state.mode = $mode
  $state.answered = $false
  $state.nightNote = $false
  if (Test-Night) { if ($mode -eq "timeup") { $state.funUntil = [datetime]::MinValue }; Show-Night }
  elseif ($mode -eq "timeup") { Show-TimeUp } elseif ($mode -eq "still") { Show-Still } else { Show-Dial }
  $form.Opacity = 0
  $form.Show()
  $form.Activate()
  $form.Invalidate()
  $fadeTimer.Start()
}

# Arrow keys normally move focus between controls; here they choose.
$form.add_PreviewKeyDown({ if ($_.KeyCode -in @("Left", "Right")) { $_.IsInputKey = $true } })
$form.add_KeyDown({
  $key = $_.KeyCode
  switch ($state.step) {
    "dial" {
      if ($key -eq "D" -and @($state.info.topTasks)[0]) { Complete-Task; return }
      if ($key -eq "Escape" -and $state.mode -eq "app") { Show-Moment "back" "You turned back.`nThat time stays yours." { $afterTimer.Start() }; return }
      switch ($key) { { $_ -in "Right", "Return", "D1", "NumPad1" } { Select-Purpose } { $_ -in "Left", "D2", "NumPad2" } { Show-ReadFirst } { $_ -in "N", "D3", "NumPad3" } { Show-Write $true } { $_ -in "T", "D4", "NumPad4" } { Show-Write $false } }
      return
    }
    "read" {
      $book = $state.info.knowledge.passage
      if ($key -eq "B" -and $book) { Log-Fact; Close-Gate "read"; Start-Process "$site/read/" }
      elseif ($key -eq "P" -and $state.info.book) { Read-Paper }
      elseif ($key -eq "Left" -and -not $holdTimer.Enabled) { Log-Fact; Show-LeisureKinds }
      elseif ($key -eq "A" -and -not $state.revealed) { $state.revealed = $true; Show-ReadFirst }
      elseif ($key -eq "K" -and $state.revealed -and -not $state.recalled) { Send-Recall "knew" }
      elseif ($key -eq "X" -and $state.revealed -and -not $state.recalled) { Send-Recall "notyet" }
    }
    "kinds" { $n = [int]"$key".TrimStart("D") - 1; if ("$key" -match "^D[1-9]$" -and $n -lt @($state.info.fun).Count) { Show-Length @($state.info.fun)[$n].kind } }
    "length" { $n = [int]"$key".TrimStart("D") - 1; if ("$key" -match "^D[1-9]$" -and $n -lt @($state.fits).Count) { Start-Pause (Get-FunPause $state.funKind) $state.funKind ([int]@($state.fits)[$n]) $false } }
    "timeup" { if ($key -eq "D") { $state.funUntil = [datetime]::MinValue; Show-Moment "done" "Good stop." { $afterTimer.Start() } } elseif ($key -eq "M" -and $state.more -ge 5) { Start-Pause $(if ($state.ext -eq 0) { 15 } else { 30 }) $state.funKind $state.more $true } }
    "still" { switch ($key) { "Y" { Select-Purpose } "D" { Show-Moment "done" "Good work." { $afterTimer.Start() } } "L" { Show-ReadFirst } }; return }
    "night" {
      switch ($key) { "L" { Show-Moment "back" "Good night.`nSleep well." { rundll32.exe user32.dll,LockWorkStation } } "S" { Close-Gate "back"; shutdown.exe /s /t 60 /c "LifeOS: good night." } "N" { $state.nightNote = $true; Show-Write $true } "U" { Show-Urgent } }
      return
    }
  }
  if ($key -eq "Escape" -and $state.step -notin @("dial", "timeup", "night")) {
    $pauseTimer.Stop()
    if ($state.step -eq "pause") { Stop-Pause }
    elseif ($state.step -eq "moment") { }
    elseif ($state.step -eq "urgent" -or ($state.step -eq "write" -and $state.nightNote)) { $state.nightNote = $false; Show-Night }
    elseif ($state.step -eq "length") { Show-Kinds }
    else { Show-Dial }
  }
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

# ---------- pictures of each step (-Shot), for checking the design ----------
if ($Shot) {
  New-Item -ItemType Directory -Force $Shot | Out-Null
  $state.info = Get-Info
  if ($state.info.accent) { $brass = [Drawing.ColorTranslator]::FromHtml($state.info.accent) }
  $form.WindowState = "Normal"
  $form.StartPosition = "Manual"
  $form.TopMost = $false
  $form.Size = New-Object Drawing.Size(1440, 900)
  $form.Location = New-Object Drawing.Point(-3000, -3000)  # off screen
  $form.Show()
  $snap = {
    param($name)
    [Windows.Forms.Application]::DoEvents()
    & $center
    $form.Refresh()
    $bmp = New-Object Drawing.Bitmap($form.Width, $form.Height)
    $form.DrawToBitmap($bmp, (New-Object Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
    $bmp.Save((Join-Path $Shot "$name.png"), [Drawing.Imaging.ImageFormat]::Png)
  }
  Show-Dial; & $snap "1-dial"
  $state.mode = "app"; Show-Dial; & $snap "1b-youtube"; Show-Still; & $snap "1c-still"; $state.mode = "unlock"
  # A recall question (a made-up card, pictures only).
  $card = [pscustomobject]@{ type = "recall"; id = "test/recall"; title = "Ohm"; q = "What does Ohm's law say?"; a = "Voltage equals current times resistance (V = I R)."; text = "V = I R"; source = "Physics" }
  $state.info | Add-Member -Force knowledge ([pscustomobject]@{ items = @($card); passage = $null })
  $state.step = "dial"; Show-ReadFirst; & $snap "2b-recall"
  $state.revealed = $true; Show-ReadFirst; & $snap "2c-recall-answer"
  $state.answered = $false; Show-Moment "back" "You turned back.`nThat time stays yours."; $momentTimer.Stop(); & $snap "12-moment"
  $state.answered = $true
  Show-ReadFirst; & $snap "2-read-first"
  Show-Kinds; & $snap "3-kinds"
  Show-Length "videos"; & $snap "4-length"
  Start-Pause 5 "videos" 10 $false; $pause.started = (Get-Date).AddSeconds(-4); & $snap "5-breathe"; $pauseTimer.Stop()
  Show-Write $true; & $snap "6-note"
  $state.funMinutes = 20; $state.funKind = "videos"; Show-TimeUp; & $snap "7-timeup"
  # The night lock, as if it started 12 minutes from now, then as if it had started.
  $hhmm = { param($d) $d.ToString("HH:mm", [Globalization.CultureInfo]::InvariantCulture) }
  $state.info | Add-Member -Force night ([pscustomobject]@{ from = (& $hhmm (Get-Date).AddMinutes(12)); until = (& $hhmm (Get-Date).AddHours(6)) })
  Show-Length "videos"; & $snap "8-length-before-night"
  Show-TimeUp; & $snap "9-timeup-before-night"
  $state.info.night.from = (& $hhmm (Get-Date).AddMinutes(-5))
  if (-not (Test-Night)) { throw "night lock: should be on" }
  if ((Get-MinutesToNight) -ne 0) { throw "night lock: no minutes should be left" }
  Show-Night; & $snap "10-night"
  Show-Urgent; & $snap "11-urgent"
  $state.info.night.from = $null
  if (Test-Night) { throw "night lock: should be off" }
  $form.Hide()
  exit 0
}

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
  if ($form.Visible) {
    if ($now.Second -eq 0) { $form.Invalidate() }  # the clock
    return
  }
  $front = $(if ($locked) { @{ name = ""; title = "" } } else { Get-Front })
  if (-not $locked -and $state.info) { Update-Grey }
  # 10 minutes before the night lock: a warning, once, if YouTube is open.
  $toNight = Get-MinutesToNight
  if (-not $locked -and $toNight -gt 0 -and $toNight -le 10 -and $state.warned -ne $now.Date) {
    $state.warned = $now.Date
    if (Test-YouTube $front) { Show-Warning "Night lock in $toNight minutes" "YouTube closes at $(Get-NightFrom)." }
  }
  # Night lock: YouTube closes (even with an urgent pass). While the PC is in use the night Gate
  # comes back (an urgent pass keeps it away for 15 minutes), except while a game runs: games are never stopped.
  if (-not $locked -and (Test-Night)) {
    if (Test-YouTube $front) { Close-YouTubeTab }
    if ($state.urgentUntil -lt $now -and ($now - $state.passed).TotalSeconds -ge 20 -and -not (Test-GameRunning)) { Show-Gate "unlock"; return }
  }
  # YouTube in Brave is leisure: without a leisure timer or a Purpose pass, the Gate comes.
  if (-not $locked -and -not (Test-Night) -and (Test-YouTube $front) -and $state.funUntil -lt $now -and $state.ytPass -lt $now -and ($now - $state.passed).TotalSeconds -ge 3) {
    $mode = $(if ($state.ytPass -ne [datetime]::MinValue) { "still" } else { "app" })
    $state.ytPass = [datetime]::MinValue
    Show-Gate $mode
    return
  }
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
