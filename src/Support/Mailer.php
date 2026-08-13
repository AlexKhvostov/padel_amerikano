<?php

declare(strict_types=1);

final class Mailer
{
    /**
     * @return array{sent: bool, via?: string, error?: string}
     */
    public static function send(string $to, string $subject, string $body): array
    {
        $from = self::fromAddress();
        $fromName = self::fromName();

        $smtpHost = trim((string) (env('MAIL_SMTP_HOST', '') ?? ''));
        if ($smtpHost !== '') {
            return self::sendSmtp($to, $subject, $body, $from, $fromName, $smtpHost);
        }

        return self::sendPhpMail($to, $subject, $body, $from, $fromName);
    }

    private static function fromAddress(): string
    {
        $from = trim((string) (env('MAIL_FROM', 'noreply@padel.ballaball.xyz') ?? 'noreply@padel.ballaball.xyz'));
        if ($from === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
            return 'noreply@padel.ballaball.xyz';
        }
        return $from;
    }

    private static function fromName(): string
    {
        $fromName = trim((string) (env('MAIL_FROM_NAME', 'Падел Американо') ?? 'Падел Американо'));
        return $fromName !== '' ? $fromName : 'Падел Американо';
    }

    /**
     * @return array{sent: bool, via?: string, error?: string}
     */
    private static function sendPhpMail(
        string $to,
        string $subject,
        string $body,
        string $from,
        string $fromName
    ): array {
        $encodedName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $headers = [
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'From: ' . $encodedName . ' <' . $from . '>',
            'Reply-To: ' . $from,
            'X-Mailer: PHP/' . PHP_VERSION,
        ];
        $headerLine = implode("\r\n", $headers);

        $sent = @mail($to, $encodedSubject, $body, $headerLine, '-f' . $from);
        if ($sent === true) {
            return ['sent' => true, 'via' => 'mail-envelope'];
        }

        $sent = @mail($to, $encodedSubject, $body, $headerLine);
        if ($sent === true) {
            return ['sent' => true, 'via' => 'mail'];
        }

        $last = error_get_last();
        $message = is_array($last) && isset($last['message'])
            ? (string) $last['message']
            : 'mail() вернул false';

        return ['sent' => false, 'error' => $message];
    }

    /**
     * SMTP через Hostland (или любой auth SMTP): SSL 465 / STARTTLS 587.
     *
     * @return array{sent: bool, via?: string, error?: string}
     */
    private static function sendSmtp(
        string $to,
        string $subject,
        string $body,
        string $from,
        string $fromName,
        string $host
    ): array {
        $port = (int) (env('MAIL_SMTP_PORT', '465') ?? '465');
        $user = trim((string) (env('MAIL_SMTP_USER', $from) ?? $from));
        $pass = (string) (env('MAIL_SMTP_PASSWORD', '') ?? '');
        $encryption = strtolower(trim((string) (env('MAIL_SMTP_ENCRYPTION', 'ssl') ?? 'ssl')));

        if ($pass === '') {
            return ['sent' => false, 'error' => 'MAIL_SMTP_PASSWORD не задан'];
        }
        if ($user === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return ['sent' => false, 'error' => 'Некорректные SMTP-параметры или получатель'];
        }

        $socket = self::smtpConnect($host, $port, $encryption);
        if ($socket === false) {
            // Частый вариант на Hostland: mail.ваш-домен.ru
            $domainHost = self::domainMailHost();
            if ($domainHost !== '' && strcasecmp($domainHost, $host) !== 0) {
                $socket = self::smtpConnect($domainHost, $port, $encryption);
                if ($socket !== false) {
                    $host = $domainHost;
                }
            }
        }
        if ($socket === false) {
            return [
                'sent' => false,
                'error' => 'Не удалось подключиться к SMTP. Проверьте MAIL_SMTP_HOST/PORT и пароль ящика.',
            ];
        }

        stream_set_timeout($socket, 20);

        try {
            self::smtpExpect($socket, [220]);
            self::smtpCommand($socket, 'EHLO ' . self::smtpEhloHost(), [250]);

            if ($encryption === 'tls') {
                self::smtpCommand($socket, 'STARTTLS', [220]);
                $crypto = @stream_socket_enable_crypto(
                    $socket,
                    true,
                    STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT
                );
                if ($crypto !== true) {
                    throw new RuntimeException('STARTTLS не удалось включить');
                }
                self::smtpCommand($socket, 'EHLO ' . self::smtpEhloHost(), [250]);
            }

            self::smtpCommand($socket, 'AUTH LOGIN', [334]);
            self::smtpCommand($socket, base64_encode($user), [334]);
            self::smtpCommand($socket, base64_encode($pass), [235]);
            self::smtpCommand($socket, 'MAIL FROM:<' . $from . '>', [250]);
            self::smtpCommand($socket, 'RCPT TO:<' . $to . '>', [250, 251]);

            self::smtpCommand($socket, 'DATA', [354]);
            $encodedName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
            $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
            $message = implode("\r\n", [
                'Date: ' . date(DATE_RFC2822),
                'From: ' . $encodedName . ' <' . $from . '>',
                'To: <' . $to . '>',
                'Reply-To: ' . $from,
                'Subject: ' . $encodedSubject,
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
                '',
                str_replace(["\r\n.", "\n."], ["\r\n..", "\n.."], str_replace(["\r\n", "\r", "\n"], "\r\n", $body)),
                '.',
            ]);
            fwrite($socket, $message . "\r\n");
            self::smtpExpect($socket, [250]);
            self::smtpCommand($socket, 'QUIT', [221]);
        } catch (Throwable $e) {
            fclose($socket);
            return ['sent' => false, 'error' => $e->getMessage()];
        }

        fclose($socket);
        return ['sent' => true, 'via' => 'smtp:' . $host];
    }

    /**
     * @return resource|false
     */
    private static function smtpConnect(string $host, int $port, string $encryption)
    {
        $remote = ($encryption === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $attempts = [
            [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true,
            ],
            [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ];

        foreach ($attempts as $ssl) {
            $ssl['crypto_method'] = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
            $errno = 0;
            $errstr = '';
            $socket = @stream_socket_client(
                $remote,
                $errno,
                $errstr,
                20,
                STREAM_CLIENT_CONNECT,
                stream_context_create(['ssl' => $ssl])
            );
            if ($socket !== false) {
                return $socket;
            }
        }

        return false;
    }

    private static function domainMailHost(): string
    {
        $appUrl = trim((string) (env('APP_URL', '') ?? ''));
        $host = $appUrl !== '' ? (string) (parse_url($appUrl, PHP_URL_HOST) ?? '') : '';
        if ($host === '' || !preg_match('/^[a-zA-Z0-9.-]+$/', $host)) {
            return '';
        }
        return 'mail.' . $host;
    }

    private static function smtpEhloHost(): string
    {
        $appUrl = trim((string) (env('APP_URL', '') ?? ''));
        $host = $appUrl !== '' ? (string) (parse_url($appUrl, PHP_URL_HOST) ?? '') : '';
        if ($host === '') {
            return 'localhost';
        }
        return preg_replace('/[^a-zA-Z0-9.-]/', '', $host) ?: 'localhost';
    }

    /**
     * @param resource $socket
     * @param list<int> $okCodes
     */
    private static function smtpCommand($socket, string $command, array $okCodes): void
    {
        fwrite($socket, $command . "\r\n");
        self::smtpExpect($socket, $okCodes);
    }

    /**
     * @param resource $socket
     * @param list<int> $okCodes
     */
    private static function smtpExpect($socket, array $okCodes): void
    {
        $response = '';
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $okCodes, true)) {
            throw new RuntimeException(trim($response) !== '' ? trim($response) : 'Пустой ответ SMTP');
        }
    }
}
