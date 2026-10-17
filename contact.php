<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

$name    = htmlspecialchars(trim($input['name'] ?? ''));
$phone   = htmlspecialchars(trim($input['phone'] ?? ''));
$email   = htmlspecialchars(trim($input['email'] ?? ''));
$message = htmlspecialchars(trim($input['message'] ?? ''));

if (!$name || !$phone || !$email || !$message) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing fields']);
    exit;
}

$to      = 'info@skinfitaesthetics.in';
$subject = "New Enquiry from $name";
$body    = "Name: $name\nPhone: $phone\nEmail: $email\n\nMessage:\n$message";
$headers = "From: website@skinfitaesthetics.in\r\nReply-To: $email\r\n";

if (mail($to, $subject, $body, $headers)) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Mail failed']);
}
?>
