-- E-Voting System Database - Initial Users
-- Plik: 02-insert-users.sql
-- Opis: Przykładowe dane testowe - członkowie komisji i użytkownicy głosujący
--
-- UWAGA: To są przykładowe hashe do celów demonstracyjnych.
-- user_hash = SHA256(imie|nazwisko|pesel) zahashowane N razy (zgodnie z konfiguracją)
-- password_hash = SHA256(hasło) zahashowane 1 raz
--
-- Przed wdrożeniem produkcyjnym wygeneruj własne hashe używając /hash-generator.html

-- ============================================================================
-- CZŁONKOWIE KOMISJI (is_commission = 1)
-- ============================================================================

-- Komisja: członek 1
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('e32a922e39bca9f2dbfb6cb0f0cf584e03c60fb479f98bea21ab059223a90edd', 
        'ab48b4432037cf76dcaca1f535819c7e6224d4618d98f48e383b82ac8a1c7db7', 
        1);

-- Komisja: członek 2
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('fc13b24067c194552d82a15e70e9da8b6da56fcc25bc5d58151caa9d7def30ac', 
        'c82f4c9fd342cb09f1493e52c044e58ef465174f78fa727d837e87cad81e0088', 
        1);

-- Komisja: członek 3
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('e55e3e32dea307ecd597d9eed40f74c34876abc8d1040e4e36e554d7e10431d5', 
        'a6a9021c32ccc8f313b365d3fc8538656d57b93ea99b502dbf0d65e56f9699a0', 
        1);

-- Komisja: członek 4
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('0b44d20c7ffeeea7f7d21e95b67519cc300854df66c82dc6e31c870d720abe09', 
        'd37228414c226c434eeb5c76958b195b4172d44433864d51db654dbc086ecb65', 
        1);

-- Komisja: członek 5
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('8cf6a2c8b207c2b986a916c11bbd3276b591bbd922ea838adf3f2804eba5e2d0', 
        '0887c2832825b9c2eb37ce2c6323ef6bc6b4054e82eb69abe75227a3bb3f0f8c', 
        1);

-- ============================================================================
-- UŻYTKOWNICY GŁOSUJĄCY (is_commission = 0)
-- ============================================================================

-- Wyborca 1
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('522cb842bce3a85fbfd7fd54f608c013368d0af5cd861b1540867311a032cc7d', 
        '5747b8c65794fbcbd6e6bb698249e17f1262555b42c2fd954a391ed60df1e7d4', 
        0);

-- Wyborca 2
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('af1defb467ef05bda180e639bfaad0b678a6c6c0469d0e5fe81310199d871a01', 
        '44f60aaf308f984aade357b35cbf1d1274a712815e2386dad249ab58e3f06afd', 
        0);

-- Wyborca 3
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('210c3eb796cc60824531092e782c8a391720d1126629af99e7b1dc402c4063aa', 
        '260b6246f48295678977e3db4932bd04a843bdbdf5d65f76fba55900bd011dd9', 
        0);

-- Wyborca 4
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('3432a578667596213b500e0a7d71dcfdeb8d325165ab6c26be433e7bfbb5dbb6', 
        'd90367999250ae8e34784dd25425924972e5006839ef6635e8cd7c599039561e', 
        0);

-- Wyborca 5
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('1ef201d9414645b45d84079c26de67681bd7e31d00fb44c9f7a50294676c6dbe', 
        'b88ca09e8ff59b83adab7f2bab7158c1a07ad40b905b53483940d8a9c4364981', 
        0);

-- Wyborca 6
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('9cbaac45eba9e247140ff93d786901caadf6427d06be0b2425a280d8fcdfc5cc', 
        'b443d0b2b86e937a559fc1629e8ba57c0c29c84e3e3fe831f3dcb30495163de2', 
        0);

-- Wyborca 7
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('af308f4abda0d7f2dd7b0765ba5a6afa53f59f821f082d73e3a3e7e8a88b9265', 
        'f2641c28b19940728defe4fb41d17dd925a9f5ee480eb99f760b2eeed71c9b69', 
        0);

-- Wyborca 8
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('eb32c89c71cb3201653d25217caaf8716ead2c7a561059ae8435201cd3aaa9fe', 
        'f8dbd9c3ce289a75adc6a7b6ec2c0bbe065843606d9109c80021eb45d381df7b', 
        0);

-- Wyborca 9
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('1cedffaf5328a5ea54f9455cc3758896f43f0f9efef1cfc03bf0eb478839dbff', 
        '14d64b1f927737bcde7fb552011a153dee850eb0d98dd049336ee8b915934b6b', 
        0);

-- Wyborca 10
INSERT INTO users (user_hash, password_hash, is_commission) 
VALUES ('8f7c25dd7982cc7edc2fea3a320902fa2d88878059d833bc1264a1313e9ef16a', 
        'd52a7be2465636f7e4b4525c593668765128fdf86cb20e0233467a476143f8a6', 
        0);

-- ============================================================================
-- KONIEC PLIKU
-- ============================================================================
