/*
 * Copyright (c) 2017–present Felipe de Leon <fglfgl27@gmail.com>
 *
 * This file is part of SmartTwitchTV <https://github.com/fgl27/SmartTwitchTV>
 *
 * SmartTwitchTV is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SmartTwitchTV is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartTwitchTV.  If not, see <https://www.gnu.org/licenses/>.
 *
 */

package com.fgl27.twitch;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;
import android.util.Log;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Local debug log server.
 *
 * Captures the app's own logcat output into rotating files and serves them over http on the
 * local network, so the device logs can be read from a computer on the same network (for
 * example while diagnosing player or ad blocking issues). The service is announced on the
 * network via mDNS as "_sptv._tcp.".
 *
 * Since API 16 an app can only read its own logcat output, so nothing from other apps or the
 * system is captured or exposed.
 *
 * Everything here is best effort: on any failure the server just doesn't run, the app itself
 * is never impacted.
 */
public final class DebugLogServer {

    private static final String TAG = "STTV_DebugLog";

    private static final int PORT = 8977;
    private static final String SERVICE_TYPE = "_sptv._tcp.";
    //Rotate the capture at 2mb keeping 3 old copies (~8mb of history, the app logs whole
    //playlists what makes the capture grow fast), at most ~6mb is served per request
    private static final int ROTATE_KB = 2048;
    private static final int ROTATE_COUNT = 3;
    private static final int MAX_SERVED_BYTES = 6 * 1024 * 1024;

    private static Context appContext;
    private static Process logcatProcess;
    private static ServerSocket serverSocket;
    private static Thread acceptThread;
    private static NsdManager nsdManager;
    private static NsdManager.RegistrationListener nsdListener;

    private DebugLogServer() {}

    public static synchronized void setEnabled(Context context, boolean enable) {
        if (enable) start(context);
        else stop();
    }

    private static void start(Context context) {
        if (serverSocket != null) return; //already running

        appContext = context.getApplicationContext();

        try {
            // "-v time" prefixes each line with its date, the rotation keeps the recent
            // history bounded without any manual cleanup
            logcatProcess = new ProcessBuilder(
                "logcat",
                "-v",
                "time",
                "-f",
                new File(logDir(), "debug.log").getAbsolutePath(),
                "-r",
                String.valueOf(ROTATE_KB),
                "-n",
                String.valueOf(ROTATE_COUNT)
            ).start();

            serverSocket = new ServerSocket(PORT);

            acceptThread = new Thread(DebugLogServer::acceptLoop);
            acceptThread.setDaemon(true);
            acceptThread.start();

            registerService(appContext);

            Log.i(TAG, "debug log server started, http port " + PORT + " ips " + getIpAddresses());
        } catch (Exception e) {
            Log.e(TAG, "failed to start the debug log server", e);
            stop();
        }
    }

    private static synchronized void stop() {
        if (nsdManager != null && nsdListener != null) {
            try {
                nsdManager.unregisterService(nsdListener);
            } catch (IllegalArgumentException e) {
                //was not registered
            }
            nsdManager = null;
            nsdListener = null;
        }

        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException ignored) {}
            serverSocket = null;
        }

        acceptThread = null;

        if (logcatProcess != null) {
            logcatProcess.destroy();
            logcatProcess = null;
        }
    }

    private static File logDir() {
        File dir = appContext.getExternalFilesDir(null);
        return dir != null ? dir : appContext.getFilesDir();
    }

    private static void acceptLoop() {
        while (serverSocket != null) {
            try (Socket socket = serverSocket.accept()) {
                socket.setSoTimeout(5000);
                handleClient(socket);
            } catch (IOException e) {
                return; //the server was closed (or the socket died), stop accepting
            }
        }
    }

    private static void handleClient(Socket socket) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
        String request = reader.readLine();

        if (request == null || !request.startsWith("GET ")) return;

        int end = request.indexOf(' ', 4);
        String path = end > 4 ? request.substring(4, end) : "/";

        while (!reader.readLine().isEmpty()) {
            //consume the headers, a malformed request with no blank line ends on the read timeout
        }

        byte[] body;
        String contentType;

        if (path.startsWith("/log")) {
            body = collectLogs();
            contentType = "text/plain; charset=utf-8";
        } else {
            body = infoPage().getBytes(StandardCharsets.UTF_8);
            contentType = "text/html; charset=utf-8";
        }

        OutputStream output = socket.getOutputStream();
        output.write(
            ("HTTP/1.0 200 OK\r\nContent-Type: " + contentType + "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII)
        );
        output.write(body);
        output.flush();
    }

    /**
     * The current capture file followed by the rotated copies (newest to oldest), capped to
     * the most recent MAX_SERVED_BYTES.
     */
    private static byte[] collectLogs() {
        ByteArrayOutputStream output = new ByteArrayOutputStream(64 * 1024);

        try {
            appendFile(output, new File(logDir(), "debug.log"), null);
            for (int i = 1; i <= ROTATE_COUNT; i++) {
                appendFile(output, new File(logDir(), "debug.log." + i), "\n===== rotated part " + i + " (older) =====\n");
            }
        } catch (Exception e) {
            write(output, "error collecting logs: " + e + "\n");
        }

        byte[] full = output.toByteArray();

        if (full.length <= MAX_SERVED_BYTES) return full;

        byte[] tail = new byte[MAX_SERVED_BYTES];
        System.arraycopy(full, full.length - MAX_SERVED_BYTES, tail, 0, MAX_SERVED_BYTES);

        ByteArrayOutputStream result = new ByteArrayOutputStream(MAX_SERVED_BYTES + 128);
        write(result, "\n... log truncated, showing the most recent part ...\n");
        result.write(tail, 0, tail.length);

        return result.toByteArray();
    }

    private static void appendFile(ByteArrayOutputStream output, File file, String header) {
        if (header != null) write(output, header);

        if (file == null || !file.exists() || file.length() == 0) return;

        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;

            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                if (output.size() > MAX_SERVED_BYTES * 2) break; //hard cap while reading
            }
        } catch (IOException e) {
            write(output, "error reading " + file + ": " + e + "\n");
        }
    }

    private static void write(ByteArrayOutputStream output, String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        output.write(bytes, 0, bytes.length);
    }

    private static String infoPage() {
        return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>SPTV debug logs</title></head><body>"
            + "<h3>Smarter Purple TV debug logs</h3>"
            + "<p><a href='/log'>Download the logs</a> (plain text, most recent "
            + (ROTATE_KB * (ROTATE_COUNT + 1))
            + "kb max)</p>"
            + "<p>Device: "
            + Build.MANUFACTURER
            + " "
            + Build.MODEL
            + ", android "
            + Build.VERSION.RELEASE
            + "</p>"
            + "<p>This server only exposes this app's own logs and only on the local network. It can be disabled in the app settings.</p>"
            + "</body></html>";
    }

    private static void registerService(Context context) {
        try {
            nsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
            if (nsdManager == null) return;

            NsdServiceInfo serviceInfo = new NsdServiceInfo();
            serviceInfo.setServiceType(SERVICE_TYPE);
            serviceInfo.setServiceName("SPTV-" + Build.MODEL.replaceAll("[^A-Za-z0-9]", ""));
            serviceInfo.setPort(PORT);

            nsdListener = new NsdManager.RegistrationListener() {
                @Override
                public void onServiceRegistered(NsdServiceInfo serviceInfo) {
                    Log.i(TAG, "mDNS service registered " + serviceInfo.getServiceName());
                }

                @Override
                public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                    Log.e(TAG, "mDNS registration failed " + errorCode);
                }

                @Override
                public void onServiceUnregistered(NsdServiceInfo serviceInfo) {}

                @Override
                public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {}
            };

            nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, nsdListener);
        } catch (Exception e) {
            Log.e(TAG, "mDNS registration error", e);
        }
    }

    private static String getIpAddresses() {
        StringBuilder builder = new StringBuilder();

        try {
            for (NetworkInterface networkInterface : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                for (InetAddress address : Collections.list(networkInterface.getInetAddresses())) {
                    if (!address.isLoopbackAddress()) {
                        if (builder.length() > 0) builder.append(", ");
                        builder.append(address.getHostAddress());
                    }
                }
            }
        } catch (Exception ignored) {}

        return builder.length() > 0 ? builder.toString() : "unknown";
    }
}
