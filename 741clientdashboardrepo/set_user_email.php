<?php
// set_user_email.php
require 'config.php';
$db = getDB();

$stmt = $db->prepare("UPDATE users SET email = ? WHERE username = 'reload'");
$stmt->execute(['client@example.com']);

echo "Updated reload email to client@example.com";
?>