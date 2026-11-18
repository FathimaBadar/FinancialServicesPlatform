package com.fsp.core.outbox;

import com.fsp.core.common.RequestCorrelation;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** Transactional outbox writer — call inside the mutating transaction. */
@Service
public class OutboxService {

    private final OutboxRepository repository;

    public OutboxService(OutboxRepository repository) {
        this.repository = repository;
    }

    public void record(String aggregateType, UUID aggregateId, String eventName, String payloadJson) {
        OutboxEvent e = new OutboxEvent();
        e.aggregateType = aggregateType;
        e.aggregateId = aggregateId;
        e.eventName = eventName;
        e.payload = payloadJson;
        e.correlationId = RequestCorrelation.currentCorrelation() == null
            ? UUID.randomUUID().toString() : RequestCorrelation.currentCorrelation();
        repository.save(e);
    }
}
