<?php
require_once 'config.php';
$db = getDB();
$db->exec("DELETE FROM comments");
echo "Comments cleared successfully.";
?>