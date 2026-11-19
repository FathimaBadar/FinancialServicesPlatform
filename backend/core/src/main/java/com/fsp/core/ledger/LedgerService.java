package com.fsp.core.ledger;

import com.fsp.core.audit.AuditService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.RequestCorrelation;
import com.fsp.core.common.Uuid5;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.rbac.PermissionService;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
public class LedgerService {

    private final BookRepository bookRepository;
    private final GlAccountRepository glAccountRepository;
    private final AccountingPeriodRepository periodRepository;
    private final TbService tbService;
    private final PermissionService permissions;
    private final TenantRepository tenantRepository;
    private final AuditService audit;
    private final OutboxService outbox;

    public LedgerService(BookRepository bookRepository,
                         GlAccountRepository glAccountRepository,
                         AccountingPeriodRepository periodRepository,
                         TbService tbService, PermissionService permissions,
                         TenantRepository tenantRepository, AuditService audit, OutboxService outbox) {
        this.bookRepository = bookRepository;
        this.glAccountRepository = glAccountRepository;
        this.periodRepository = periodRepository;
        this.tbService = tbService;
        this.permissions = permissions;
        this.tenantRepository = tenantRepository;
        this.audit = audit;
        this.outbox = outbox;
    }

    /** Provision the default CoA template for the tenant's sub-type (PRD §6 endpoint). */
    @Transactional
    public List<GlAccount> provisionDefault(UUID tenantId, UUID bookId, Actor actor) {
        Tenant tenant = tenantRepository.findById(tenantId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Tenant not found"));
        String template = tenant.subType == null || tenant.subType.isBlank() ? "GENERIC" : tenant.subType;
        return provisionTemplate(tenantId, bookId, actor, CoaTemplates.forTenant(template), template);
    }

    /** ISO-4217 numeric ledger id (bounded set for Phase-0, per PRD §3.5). */
    public static int isoNumeric(String currency) {
        return switch (currency) {
            case "NAD" -> 516;
            case "ZAR" -> 710;
            case "USD" -> 840;
            case "EUR" -> 978;
            case "GBP" -> 826;
            default -> throw ApiException.badRequest("CURRENCY_UNSUPPORTED",
                "Phase-0 supports NAD/ZAR/USD/EUR/GBP; add ISO numeric for " + currency);
        };
    }

    // ---------- books ----------

    @Transactional
    public Book createBook(UUID tenantId, String name, String currency) {
        if (currency == null || currency.length() != 3 || !currency.chars().allMatch(Character::isLetter)) {
            throw ApiException.badRequest("BOOK_CURRENCY_INVALID", "currency must be a 3-letter ISO code");
        }
        Book book = new Book();
        book.id = UUID.randomUUID();
        book.tenantId = tenantId;
        book.name = name;
        book.currency = currency.toUpperCase();
        book.ledgerId = isoNumeric(book.currency);
        book.status = "SUSPENDED";
        Book saved = bookRepository.save(book);
        log.debug("book_created tenantId={} bookId={} currency={}", tenantId, saved.id, book.currency);
        var actor = RequestCorrelation.currentActor();
        audit.record(actor == null ? null : actor.personId(), null, tenantId, saved.id,
            "BOOK_CREATED", "BOOK", saved.id.toString(),
            audit.hashState("null"), audit.hashState("status=SUSPENDED;currency=" + book.currency), false);
        return saved;
    }

    public List<Book> books(UUID tenantId, Actor actor) {
        permissions.require(actor, "gl.account.view", tenantId);
        return bookRepository.findByTenantIdOrderByCreatedAtAsc(tenantId);
    }

    /** KYC verification opened the tenant: its SUSPENDED books go ACTIVE (docs §7.3,
     *  "child tenant is born with suspended books; the book auto-opens on verdict"). */
    @Transactional
    public void openBooksForTenant(UUID tenantId) {
        List<Book> opened = bookRepository.findByTenantIdOrderByCreatedAtAsc(tenantId).stream()
            .filter(b -> "SUSPENDED".equals(b.status))
            .toList();
        if (opened.isEmpty()) return;
        var actor = RequestCorrelation.currentActor();
        for (Book b : opened) {
            b.status = "ACTIVE";
            bookRepository.save(b);
            audit.record(actor == null ? null : actor.personId(), null, tenantId, b.id,
                "BOOK_OPENED", "BOOK", b.id.toString(),
                null, audit.hashState("status=ACTIVE;currency=" + b.currency), false);
        }
        log.info("books_opened tenantId={} books={}", tenantId, opened.size());
    }

    // ---------- CoA provisioning ----------

    /**
     * Provision a CoA template into a book: GL rows + TigerBeetle accounts,
     * then book -> ACTIVE + an OPEN current period (PRD actor table: bootstrap self-approval audited).
     * Any TbResult other than Ok throws a problem that ROLLS BACK this transaction — no orphan GL rows.
     */
    @Transactional
    public List<GlAccount> provisionTemplate(UUID tenantId, UUID bookId, Actor actor,
                                             List<CoaTemplates.Row> rows, String templateName) {
        Book book = bookRepository.findById(bookId)
            .orElseThrow(() -> ApiException.notFound("BOOK_NOT_FOUND", "Book " + bookId + " not found"));
        if (!book.tenantId.equals(tenantId)) {
            throw ApiException.forbidden("TENANT_MISMATCH", "Book does not belong to tenant");
        }
        List<GlAccount> existing = glAccountRepository.findByBookIdOrderByCodeAsc(bookId);
        if (!existing.isEmpty()) {
            throw ApiException.conflict("COA_ALREADY_PROVISIONED", "Book already has GL accounts; provision once");
        }

        List<GlAccount> created = new ArrayList<>();
        List<TbService.AccountSpec> tbSpecs = new ArrayList<>();
        for (CoaTemplates.Row row : rows) {
            GlAccount gl = new GlAccount();
            gl.id = Uuid5.glAccountId(bookId, UUID.nameUUIDFromBytes(String.valueOf(row.code()).getBytes()));
            gl.bookId = bookId;
            gl.tenantId = tenantId;
            gl.tbAccountId = Uuid5.glAccountId(bookId, gl.id).toString();
            gl.ledgerId = book.ledgerId;
            gl.code = row.code();
            gl.name = row.name();
            gl.accountType = row.accountType();
            gl.normalBalance = row.normalBalance();
            gl.balanceBound = row.balanceBound();
            gl.postingAllowed = true;
            gl.currency = book.currency;
            gl.status = "ACTIVE";
            gl.createdBy = actor.personId();
            gl.approvedBy = actor.personId(); // bootstrap self-approval, audited
            created.add(gl);
            tbSpecs.add(new TbService.AccountSpec(
                Uuid5.glAccountId(bookId, gl.id),
                book.ledgerId,
                row.code(),
                tbService.flagFor(bound(row.balanceBound()), "ASSET".equals(row.accountType())),
                gl.id,
                tenantId.getLeastSignificantBits(),
                0));
        }

        switch (tbService.createAccounts(tbSpecs)) {
            case TbResult.Ok ok -> log.debug("tb_accounts_provisioned bookId={} count={}", bookId, tbSpecs.size());
            case TbResult.DefinitiveRejection rejected -> {
                log.warn("coa_provision_rejected tenantId={} bookId={} detail={}", tenantId, bookId, rejected.detail());
                throw ApiException.conflict("TB_ACCOUNT_REJECTED", rejected.detail());
            }
            case TbResult.UnknownTransport unknown -> {
                log.error("coa_provision_unknown_transport tenantId={} bookId={} detail={}", tenantId, bookId, unknown.detail());
                throw ApiException.serviceUnavailable("LEDGER_UNAVAILABLE", unknown.detail());
            }
        }

        glAccountRepository.saveAll(created);

        book.status = "ACTIVE";
        bookRepository.save(book);

        LocalDate today = LocalDate.now(java.time.ZoneOffset.UTC);
        AccountingPeriod period = new AccountingPeriod();
        period.id = UUID.randomUUID();
        period.tenantId = tenantId;
        period.bookId = bookId;
        period.fiscalYear = today.getYear();
        period.periodNo = today.getMonthValue();
        period.startDate = today.withDayOfMonth(1);
        period.endDate = today.withDayOfMonth(today.lengthOfMonth());
        period.status = "OPEN";
        period.openedBy = actor.personId();
        periodRepository.save(period);

        audit.record(actor.personId(), null, tenantId, bookId, "COA_PROVISIONED", "BOOK", bookId.toString(),
            audit.hashState("status=SUSPENDED"), audit.hashState("accounts=%d;template=%s".formatted(created.size(), templateName)),
            false);
        outbox.record("Book", bookId, "GL_ACCOUNT_CREATED",
            "{\"bookId\":\"%s\",\"template\":\"%s\",\"accounts\":%d}".formatted(bookId, templateName, created.size()));
        log.info("coa_provisioned tenantId={} bookId={} currency={} accounts={} template={} (bootstrap self-approval audited)",
            tenantId, bookId, book.currency, created.size(), templateName);
        return created;
    }

    /**
     * Additive, idempotent CoA provision (plans/inventory-plugin-plan.md D4): inserts ONLY rows whose
     * code does not already exist in the book; existing accounts at those codes are used as-is
     * (code collisions, e.g. PSP template 2110 "Payouts in Transit", are never recreated).
     * Does NOT flip the book status and does NOT create periods. Rows carry the same deterministic
     * UUID math as provisionTemplate, so a duplicate ensure is idempotent (same PK re-insert → 500
     * conflict instead of a second account). The plugin's readiness step calls this at activation.
     */
    @Transactional
    public List<GlAccount> ensureAdditive(UUID tenantId, UUID bookId, Actor actor, List<CoaTemplates.Row> rows) {
        permissions.require(actor, "gl.account.create", tenantId);
        Book book = bookRepository.findById(bookId)
            .orElseThrow(() -> ApiException.notFound("BOOK_NOT_FOUND", "Book " + bookId + " not found"));
        if (!book.tenantId.equals(tenantId)) {
            throw ApiException.forbidden("TENANT_MISMATCH", "Book does not belong to tenant");
        }
        var existingCodes = glAccountRepository.findByBookIdOrderByCodeAsc(bookId).stream()
            .map(g -> g.code).collect(java.util.stream.Collectors.toSet());
        List<CoaTemplates.Row> missing = rows.stream().filter(r -> !existingCodes.contains(r.code())).toList();
        if (missing.isEmpty()) {
            log.debug("coa_ensure_noop tenantId={} bookId={}", tenantId, bookId);
            return List.of();
        }

        List<GlAccount> created = new ArrayList<>();
        List<TbService.AccountSpec> tbSpecs = new ArrayList<>();
        for (CoaTemplates.Row row : missing) {
            GlAccount gl = new GlAccount();
            gl.id = Uuid5.glAccountId(bookId, UUID.nameUUIDFromBytes(String.valueOf(row.code()).getBytes()));
            gl.bookId = bookId;
            gl.tenantId = tenantId;
            gl.tbAccountId = Uuid5.glAccountId(bookId, gl.id).toString();
            gl.ledgerId = book.ledgerId;
            gl.code = row.code();
            gl.name = row.name();
            gl.accountType = row.accountType();
            gl.normalBalance = row.normalBalance();
            gl.balanceBound = row.balanceBound();
            gl.postingAllowed = true;
            gl.currency = book.currency;
            gl.status = "ACTIVE";
            gl.createdBy = actor.personId();
            gl.approvedBy = actor.personId(); // machine provisioning, audited
            created.add(gl);
            tbSpecs.add(new TbService.AccountSpec(
                Uuid5.glAccountId(bookId, gl.id),
                book.ledgerId,
                row.code(),
                tbService.flagFor(bound(row.balanceBound()), "ASSET".equals(row.accountType())),
                gl.id,
                tenantId.getLeastSignificantBits(),
                0));
        }
        switch (tbService.createAccounts(tbSpecs)) {
            case TbResult.Ok ok -> log.debug("tb_accounts_ensured bookId={} count={}", bookId, tbSpecs.size());
            case TbResult.DefinitiveRejection rejected -> {
                log.warn("coa_ensure_rejected tenantId={} bookId={} detail={}", tenantId, bookId, rejected.detail());
                throw ApiException.conflict("TB_ACCOUNT_REJECTED", rejected.detail());
            }
            case TbResult.UnknownTransport unknown -> {
                log.error("coa_ensure_unknown_transport tenantId={} bookId={} detail={}", tenantId, bookId, unknown.detail());
                throw ApiException.serviceUnavailable("LEDGER_UNAVAILABLE", unknown.detail());
            }
        }
        glAccountRepository.saveAll(created);
        audit.record(actor.personId(), null, tenantId, bookId, "COA_ENSURED", "BOOK", bookId.toString(),
            audit.hashState("null"), audit.hashState("accounts=%d;codes=%s".formatted(created.size(),
                created.stream().map(g -> g.code).map(String::valueOf).sorted().toList())), false);
        outbox.record("Book", bookId, "GL_ACCOUNT_CREATED",
            "{\"bookId\":\"%s\",\"ensure\":\"additive\",\"accounts\":%d}".formatted(bookId, created.size()));
        log.info("coa_ensured tenantId={} bookId={} added={} codes={}", tenantId, bookId, created.size(),
            created.stream().map(g -> g.code).toList());
        return created;
    }

    private TbService.Bound bound(String balanceBound) {
        return switch (balanceBound) {
            case "DEBIT_BOUND" -> TbService.Bound.DEBIT_BOUND;
            case "CREDIT_BOUND" -> TbService.Bound.CREDIT_BOUND;
            default -> TbService.Bound.NONE;
        };
    }

    // ---------- GL accounts ----------

    public List<GlAccount> glAccounts(UUID tenantId, UUID bookId, Actor actor) {
        permissions.require(actor, "gl.account.view", tenantId);
        Book book = bookRepository.findById(bookId)
            .orElseThrow(() -> ApiException.notFound("BOOK_NOT_FOUND", "Book not found"));
        if (!book.tenantId.equals(tenantId)) throw ApiException.forbidden("TENANT_MISMATCH", "Book does not belong to tenant");
        return glAccountRepository.findByBookIdOrderByCodeAsc(bookId);
    }

    public record GlBalanceView(UUID glAccountId, int code, String name, String currency, String status,
                                String tbAccountId, long debitsPosted, long creditsPosted) {}

    public GlBalanceView balance(UUID tenantId, UUID bookId, UUID glAccountId, Actor actor) {
        permissions.require(actor, "gl.account.view", tenantId);
        GlAccount gl = glAccountRepository.findById(glAccountId)
            .orElseThrow(() -> ApiException.notFound("GL_NOT_FOUND", "GL account not found"));
        if (!gl.bookId.equals(bookId) || !gl.tenantId.equals(tenantId)) {
            throw ApiException.forbidden("TENANT_MISMATCH", "Account out of scope");
        }
        long debits = 0, credits = 0;
        if (gl.tbAccountId != null) {
            Optional<TbService.Balance> opt = tbService.lookupBalance(UUID.fromString(gl.tbAccountId));
            if (opt.isPresent()) {
                debits = opt.get().debitsPosted();
                credits = opt.get().creditsPosted();
            }
        }
        return new GlBalanceView(gl.id, gl.code, gl.name, gl.currency, gl.status, gl.tbAccountId, debits, credits);
    }

    // ---------- periods ----------

    public List<AccountingPeriod> periods(UUID tenantId, UUID bookId, Actor actor) {
        permissions.require(actor, "gl.account.view", tenantId);
        return periodRepository.findByBookIdOrderByFiscalYearDescPeriodNoDesc(bookId);
    }

    @Transactional
    public AccountingPeriod openCurrentPeriod(UUID tenantId, UUID bookId, Actor actor) {
        permissions.require(actor, "period.open", tenantId);
        Book book = bookRepository.findById(bookId)
            .orElseThrow(() -> ApiException.notFound("BOOK_NOT_FOUND", "Book not found"));
        LocalDate today = LocalDate.now(java.time.ZoneOffset.UTC);
        AccountingPeriod period = new AccountingPeriod();
        period.id = UUID.randomUUID();
        period.tenantId = tenantId;
        period.bookId = bookId;
        period.fiscalYear = today.getYear();
        period.periodNo = today.getMonthValue();
        period.startDate = today.withDayOfMonth(1);
        period.endDate = today.withDayOfMonth(today.lengthOfMonth());
        period.status = "OPEN";
        period.openedBy = actor.personId();
        AccountingPeriod saved = periodRepository.save(period);
        audit.record(actor.personId(), null, tenantId, bookId, "PERIOD_OPENED", "PERIOD", saved.id.toString(),
            audit.hashState("null"), audit.hashState(saved.fiscalYear + "/" + saved.periodNo + "/OPEN"), false);
        return saved;
    }
}
