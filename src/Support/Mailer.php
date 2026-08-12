<?php

declare(strict_types=1);

final class Mailer
{
    public static function send(string $to, string $subject, string $body): bool
    {
        $from = trim((string) (env('MAIL_FROM', 'noreply@padel.ballaball.xyz') ?? 'noreply@padel.ballaball.xyz'));
        if ($from === '') {
            $from = 'noreply@padel.ballaball.xyz';
        }
        $headers = [
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'From: ' . $from,
            'Reply-To: ' . $from,
            'X-Mailer: PHP/' . PHP_VERSION,
        ];
        return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
    }
}
