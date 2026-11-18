package com.fsp.bff;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

/**
 * Session infrastructure (FAPI2 guide §1): HttpOnly SameSite cookie + CSRF double-submit on
 * session-authenticated writes. Sender-constrained tokens never enter the browser — the SPA
 * only ever holds this session cookie. Core's internal credential lives only in BFF config.
 */
@Configuration
@EnableWebSecurity
public class BffSecurityConfig {

    @Bean
    public SecurityFilterChain bffSecurityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll()) // session model enforced per-route in controllers
            .httpBasic(h -> h.disable())
            .formLogin(f -> f.disable())
            .logout(l -> l.disable());
        return http.build();
    }
}
