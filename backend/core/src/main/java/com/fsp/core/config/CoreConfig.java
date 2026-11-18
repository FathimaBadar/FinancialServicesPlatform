package com.fsp.core.config;

import com.fsp.core.actas.ActAsFilter;
import com.fsp.core.actas.ActAsService;
import com.fsp.core.common.ActorContextFilter;
import com.fsp.core.common.FspOperationInterceptor;
import com.fsp.core.idempotency.IdempotencyFilter;
import com.fsp.core.idempotency.IdempotencyRecordRepository;
import com.fsp.core.rbac.PermissionService;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(FspProperties.class)
public class CoreConfig implements WebMvcConfigurer {

    private final PermissionService permissionService;

    public CoreConfig(PermissionService permissionService) {
        this.permissionService = permissionService;
    }

    /** Jackson-2 ObjectMapper for services that parse/serialize JSON payloads directly
     *  (e.g. UserAdminService approval payloads). Boot 4 auto-configures Jackson 3
     *  (tools.jackson) only — this bean fills the com.fasterxml gap. */
    @Bean
    public com.fasterxml.jackson.databind.ObjectMapper fspObjectMapper() {
        return new com.fasterxml.jackson.databind.ObjectMapper();
    }

    /** Operation-catalog enforcement (FAPI2 guide §3): per-@FspOperation permission admission. */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new FspOperationInterceptor(permissionService))
            .addPathPatterns("/v1/**")
            .order(10);
    }

    /** Phase-0: admission is via ActorContextFilter (internal credential + identity headers)
     *  and PermissionService in services. Spring Security gate is permit-all so it never
     *  double-blocks; real OAuth2/FAPI wiring lands per the implementation guide. */
    @Bean
    public SecurityFilterChain coreSecurityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .httpBasic(h -> h.disable())
            .formLogin(f -> f.disable())
            .logout(l -> l.disable());
        return http.build();
    }

    @Bean
    public FilterRegistrationBean<ActorContextFilter> actorContextFilter(
            FspProperties props, com.fsp.core.plugin.authz.ActorAssertionService delegation) {
        FilterRegistrationBean<ActorContextFilter> reg = new FilterRegistrationBean<>(
            new ActorContextFilter(props.getSecurity().getInternalCredential(), delegation));
        reg.addUrlPatterns("/v1/*", "/internal/*");
        reg.setOrder(1);
        reg.setName("fsp-actor-context-filter");
        return reg;
    }

    /** Transport-level idempotency on mutating /v1 requests (AGENTS.md §2e). Runs after
     *  ActorContextFilter so the actor identity is already resolved. */
    @Bean
    public FilterRegistrationBean<IdempotencyFilter> idempotencyFilter(IdempotencyRecordRepository repository) {
        FilterRegistrationBean<IdempotencyFilter> reg = new FilterRegistrationBean<>(
            new IdempotencyFilter(repository));
        reg.addUrlPatterns("/v1/*");
        reg.setOrder(2);
        reg.setName("fsp-idempotency-filter");
        return reg;
    }

    /** Act-as tenant ("sudo"): replaces the principal with the acting principal when
     *  X-Act-As is present. Runs after IdempotencyFilter so the session is validated
     *  before any mutating work. */
    @Bean
    public FilterRegistrationBean<ActAsFilter> actAsFilter(ActAsService actAsService) {
        FilterRegistrationBean<ActAsFilter> reg = new FilterRegistrationBean<>(
            new ActAsFilter(actAsService));
        reg.addUrlPatterns("/v1/*");
        reg.setOrder(3);
        reg.setName("fsp-act-as-filter");
        return reg;
    }
}
