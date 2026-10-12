/*
 * A file server of about thirty lines, so the app can be opened over a
 * real origin instead of as a file.
 *
 * The Android app serves itself over https from inside the process. That
 * is a secure context with a stable origin, and it is not the same thing
 * as file:// — different storage rules, different crypto rules. When the
 * app came up blank in the emulator there was no way to tell whether the
 * page was at fault or the emulator's software renderer was, because the
 * emulator kept dying before anything could be read out of it.
 *
 * http://localhost is a secure context by the same rule, so this puts the
 * page in the same position in a browser that can actually be questioned.
 */
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.*;

public class Serve {
  public static void main(String[] a) throws Exception {
    Path root = Paths.get(a[0]);
    int port = Integer.parseInt(a[1]);
    HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
    s.createContext("/", ex -> {
      String p = ex.getRequestURI().getPath();
      if (p.equals("/") || p.isEmpty()) p = "/index.html";
      Path f = root.resolve(p.substring(1)).normalize();
      if (!f.startsWith(root) || !Files.exists(f)) {
        ex.sendResponseHeaders(404, -1); ex.close(); return;
      }
      byte[] b = Files.readAllBytes(f);
      String t = p.endsWith(".html") ? "text/html"
               : p.endsWith(".js")   ? "text/javascript"
               : p.endsWith(".css")  ? "text/css" : "application/octet-stream";
      ex.getResponseHeaders().add("Content-Type", t + "; charset=utf-8");
      ex.sendResponseHeaders(200, b.length);
      ex.getResponseBody().write(b);
      ex.close();
    });
    s.setExecutor(null);
    s.start();
    System.out.println("serving " + root + " on http://127.0.0.1:" + port);
  }
}
