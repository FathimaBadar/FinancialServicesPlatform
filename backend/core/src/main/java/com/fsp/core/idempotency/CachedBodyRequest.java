package com.fsp.core.idempotency;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Buffers the whole request body so its hash can be taken before dispatch (payloads are small JSON). */
public final class CachedBodyRequest extends HttpServletRequestWrapper {

    private static final int MAX_BODY = 1_048_576; // 1 MiB cap for idempotent mutation bodies

    private final byte[] body;
    private final Charset encoding;

    public CachedBodyRequest(HttpServletRequest request) throws IOException {
        super(request);
        this.encoding = request.getCharacterEncoding() == null
            ? StandardCharsets.UTF_8
            : Charset.forName(request.getCharacterEncoding());
        this.body = request.getInputStream().readAllBytes();
        if (this.body.length > MAX_BODY) {
            throw new IllegalStateException("body exceeds idempotency size cap");
        }
    }

    public String bodyAsString() {
        return new String(body, encoding);
    }

    @Override
    public ServletInputStream getInputStream() {
        ByteArrayInputStream buffer = new ByteArrayInputStream(body);
        return new ServletInputStream() {
            @Override public boolean isFinished() { return buffer.available() == 0; }
            @Override public boolean isReady() { return true; }
            @Override public void setReadListener(ReadListener listener) { /* sync */ }
            @Override public int read() { return buffer.read(); }
        };
    }
}
