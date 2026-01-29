-- Adicionar FOREIGN KEY com CASCADE DELETE para prevenção de órfãs futuras
ALTER TABLE instance_subscriptions
ADD CONSTRAINT fk_instance_subscriptions_maturador_instances
FOREIGN KEY (instance_id) REFERENCES maturador_instances(id) ON DELETE CASCADE;