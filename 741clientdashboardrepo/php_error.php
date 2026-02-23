<?php
ini_set('display_errors', 1);
echo "<h3>Last 20 lines of error_log:</h3><pre>";
if (file_exists('error_log')) {
    $lines = file('error_log');
    $last = array_slice($lines, -20);
    foreach ($last as $line) {
        echo htmlspecialchars($line);
    }
} else {
    echo "error_log file not found.";
}
echo "</pre>";
?>