<?php
// ═══════════════════════════════════════════════
//  AXONE — pulse.php
//  Reçoit les données accéléromètre des téléphones
// ═══════════════════════════════════════════════

header('Content-Type: application/json');

// Pas de CORS nécessaire : même domaine

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo '{"error":"POST only"}';
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['m']) || !isset($input['id'])) {
    http_response_code(400);
    echo '{"error":"missing m or id"}';
    exit;
}

$dir = __DIR__ . '/data/';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

// Sanitize l'ID (alphanum + tiret seulement)
$id = preg_replace('/[^a-zA-Z0-9\-]/', '', substr($input['id'], 0, 20));
if (empty($id)) {
    http_response_code(400);
    echo '{"error":"invalid id"}';
    exit;
}

// Écrire la magnitude + timestamp
$payload = json_encode([
    'm' => round(floatval($input['m']), 2),
    't' => time()
]);

file_put_contents($dir . $id . '.json', $payload, LOCK_EX);

echo '{"ok":true}';
