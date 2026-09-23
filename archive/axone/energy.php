<?php
// ═══════════════════════════════════════════════
//  AXONE — energy.php
//  Retourne l'énergie collective agrégée
//  Pollé par le PC de Thomas (~10x/sec)
// ═══════════════════════════════════════════════

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store');

$dir = __DIR__ . '/data/';
$now = time();
$ceiling = 18;    // m/s² max
$timeout = 8;     // secondes d'inactivité avant suppression
$sum = 0;
$count = 0;

if (is_dir($dir)) {
    $files = glob($dir . '*.json');
    foreach ($files as $f) {
        $raw = @file_get_contents($f);
        if ($raw === false) continue;
        
        $d = json_decode($raw, true);
        if (!$d || !isset($d['t'])) {
            @unlink($f);
            continue;
        }
        
        if (($now - $d['t']) > $timeout) {
            // Client inactif → supprimer
            @unlink($f);
            continue;
        }
        
        $sum += floatval($d['m']);
        $count++;
    }
}

$energy = 0.0;
if ($count > 0) {
    $avg = $sum / $count;
    $energy = min(1.0, max(0.0, $avg / $ceiling));
}

echo json_encode([
    'energy'  => round($energy, 4),
    'clients' => $count
]);
