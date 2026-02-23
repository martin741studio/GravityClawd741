<?php
// test_mail.php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require 'includes/Mailer.php';

$mailer = new Mailer();
$to = '741studio18@googlemail.com';
$subject = 'SMTP Test from Portal';
$body = '<h1>SMTP Works!</h1><p>This email was sent via Gmail SMTP using the PHP socket class.</p>';

if ($mailer->send($to, $subject, $body)) {
    echo "✅ SMTP Email sent successfully!";
} else {
    echo "❌ SMTP Email Failed.";
}
?>