import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { SerializedSignature } from "@mysten/sui.js/cryptography";
import {
  genAddressSeed,
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  getZkLoginSignature,
  jwtToAddress,
} from "@mysten/zklogin";
import { LoadingButton } from "@mui/lab";
import { fromB64 } from "@mysten/bcs";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { MIST_PER_SUI } from "@mysten/sui.js/utils";
import GoogleLogo from "../../google.svg";
import axios from "axios";
import { BigNumber } from "bignumber.js";
import { JwtPayload, jwtDecode } from "jwt-decode";
import { enqueueSnackbar } from "notistack";
import queryString from "query-string";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import "../../App.css";
import {
  FULLNODE_URL,
  CLIENT_ID,
  KEY_PAIR_SESSION_STORAGE_KEY,
  MAX_EPOCH_LOCAL_STORAGE_KEY,
  RANDOMNESS_SESSION_STORAGE_KEY,
  REDIRECT_URI,
  SUI_DEVNET_FAUCET,
  SUI_PROVER_DEV_ENDPOINT,
  USER_SALT_LOCAL_STORAGE_KEY,
} from "../../constant";
export type PartialZkLoginSignature = Omit<
  Parameters<typeof getZkLoginSignature>["0"]["inputs"],
  "addressSeed"
>;
const suiClient = new SuiClient({ url: FULLNODE_URL });

function AuthComponent() {
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [currentEpoch, setCurrentEpoch] = useState("");
  const [nonce, setNonce] = useState("");
  const [oauthParams, setOauthParams] =
    useState<queryString.ParsedQuery<string>>();
  const [zkLoginUserAddress, setZkLoginUserAddress] = useState("");
  const [decodedJwt, setDecodedJwt] = useState<JwtPayload>();
  const [jwtString, setJwtString] = useState("");
  const [ephemeralKeyPair, setEphemeralKeyPair] = useState<Ed25519Keypair>();
  const [userSalt, setUserSalt] = useState<string>();
  const [zkProof, setZkProof] = useState<PartialZkLoginSignature>();
  const [extendedEphemeralPublicKey, setExtendedEphemeralPublicKey] =
    useState("");
  const [maxEpoch, setMaxEpoch] = useState(0);
  const [randomness, setRandomness] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [fetchingZKProof, setFetchingZKProof] = useState(false);
  const [executingTxn, setExecutingTxn] = useState(false);
  const [executeDigest, setExecuteDigest] = useState("");

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const res = queryString.parse(location.hash);
    setOauthParams(res);
  }, [location]);

  // query jwt id_token
  useEffect(() => {
    if (oauthParams && oauthParams.id_token) {
      const decodedJwt = jwtDecode(oauthParams.id_token as string);
      setJwtString(oauthParams.id_token as string);
      setDecodedJwt(decodedJwt);
      setActiveStep(1);
      console.log("active step :: ",activeStep);
    }
  }, [oauthParams]);

  useEffect(() => {
    const privateKey = window.sessionStorage.getItem(
      KEY_PAIR_SESSION_STORAGE_KEY
    );
    if (privateKey) {
      const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(
        fromB64(privateKey)
      );
      setEphemeralKeyPair(ephemeralKeyPair);
    }
    const randomness = window.sessionStorage.getItem(
      RANDOMNESS_SESSION_STORAGE_KEY
    );
    if (randomness) {
      setRandomness(randomness);
    }
    const userSalt = window.localStorage.getItem(USER_SALT_LOCAL_STORAGE_KEY);
    if (userSalt) {
      setUserSalt(userSalt);
    }

    const maxEpoch = window.localStorage.getItem(MAX_EPOCH_LOCAL_STORAGE_KEY);

    if (maxEpoch) {
      setMaxEpoch(Number(maxEpoch));
    }
  }, []);

  // query zkLogin address balance
  const { data: addressBalance } = useSuiClientQuery(
    "getBalance",
    {
      owner: zkLoginUserAddress,
    },
    {
      enabled: Boolean(zkLoginUserAddress),
      refetchInterval: 1500,
    }
  );

  const [requestingFaucet, setRequestingFaucet] = useState(false);

  const requestFaucet = async () => {
    if (!zkLoginUserAddress) {
      return;
    }
    try {
      setRequestingFaucet(true);
      await axios.post(SUI_DEVNET_FAUCET, {
        FixedAmountRequest: {
          recipient: zkLoginUserAddress,
        },
      });
      enqueueSnackbar("Success!", {
        variant: "success",
      });
    } catch (error) {
      enqueueSnackbar(String(error), {
        variant: "error",
      });
    } finally {
      setRequestingFaucet(false);
    }
  };

  return (
    <Box
    sx={{
      mt: "24px",
      p: "50px",
    }}
    className="border border-slate-300 rounded-xl">
      {zkLoginUserAddress && (
        <Stack direction="row" spacing={1} sx={{ mt: "24px" }}>
          <Typography>
            <code>
              <Typography
                component="span"
                sx={{
                  fontFamily: "'Noto Sans Mono', monospace;",
                  fontWeight: 600,
                }}
              >
                {zkLoginUserAddress}
              </Typography>
            </code>
          </Typography>
          {addressBalance && (
            <Typography>
              Balance:{" "}
              {BigNumber(addressBalance?.totalBalance)
                .div(MIST_PER_SUI.toString())
                .toFixed(6)}{" "}
              HYDRO
            </Typography>
          )}
        </Stack>
      )}

      <div>
        {
          <Stack spacing={2}>
            <Typography
              sx={{
                fontSize: "1.25rem",
                fontWeight: 600,
                mb: "12px !important",
              }}
            ></Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                style={{ backgroundColor: "blue", color: "white" }}
                disabled={Boolean(ephemeralKeyPair)}
                onClick={() => {
                  const ephemeralKeyPair = Ed25519Keypair.generate();

                  window.sessionStorage.setItem(
                    KEY_PAIR_SESSION_STORAGE_KEY,
                    ephemeralKeyPair.export().privateKey
                  );
                  setEphemeralKeyPair(ephemeralKeyPair);
                }}
              >
                Create random ephemeral KeyPair{" "}
              </Button>
              <Button
                variant="contained"
                // color="error"
                style={{ backgroundColor: "red", color: "white" }}
                disabled={!ephemeralKeyPair}
                onClick={() => {
                  window.sessionStorage.removeItem(
                    KEY_PAIR_SESSION_STORAGE_KEY
                  );
                  setEphemeralKeyPair(undefined);
                }}
              >
                Clear ephemeral KeyPair{" "}
              </Button>
            </Stack>
            <Typography>
              <SyntaxHighlighter wrapLongLines language="json">
                {JSON.stringify(ephemeralKeyPair?.export()) !== undefined
                  ? `// PrivateKey\n${JSON.stringify(
                      ephemeralKeyPair?.export()
                    )}`
                  : "please click on above button"}
              </SyntaxHighlighter>
              <SyntaxHighlighter wrapLongLines language="json">
                {JSON.stringify(ephemeralKeyPair?.getPublicKey().toBase64()) !==
                undefined
                  ? `// PublicKey
${JSON.stringify(ephemeralKeyPair?.getPublicKey().toBase64())}`
                  : "please click on above button"}
              </SyntaxHighlighter>
            </Typography>
          </Stack>
        }
        {/* Step 2 */}
        {
          <Stack spacing={2}>
            <Typography
              sx={{
                fontSize: "1.25rem",
                fontWeight: 600,
                mb: "12px !important",
              }}
            ></Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                flexDirection: "column",
              }}
            >
              <Button
                variant="contained"
                style={{ backgroundColor: "blue", color: "white" }}
                size="small"
                onClick={async () => {
                  const { epoch } = await suiClient.getLatestSuiSystemState();

                  setCurrentEpoch(epoch);
                  window.localStorage.setItem(
                    MAX_EPOCH_LOCAL_STORAGE_KEY,
                    String(Number(epoch) + 10)
                  );
                  setMaxEpoch(Number(epoch) + 10);
                }}
              >
                Fetch current Epoch
              </Button>
              <Box sx={{ mt: "6px" }}>
                Epoch: {currentEpoch || "please click on above button"}
              </Box>
              <Typography sx={{ mt: "6px" }}>maxEpoch: {maxEpoch}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="contained"
                style={{ backgroundColor: "blue", color: "white" }}
                size="small"
                onClick={() => {
                  const randomness = generateRandomness();
                  window.sessionStorage.setItem(
                    RANDOMNESS_SESSION_STORAGE_KEY,
                    randomness
                  );
                  setRandomness(randomness);
                }}
              >
                Generate randomness
              </Button>
              <Typography>{randomness}</Typography>
            </Stack>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Button
                  variant="contained"
                  disabled={
                    !ephemeralKeyPair ||
                    !maxEpoch ||
                    !currentEpoch ||
                    !randomness
                  }
                  onClick={() => {
                    if (!ephemeralKeyPair) {
                      return;
                    }
                    const nonce = generateNonce(
                      ephemeralKeyPair.getPublicKey(),
                      maxEpoch,
                      randomness
                    );
                    setNonce(nonce);
                  }}
                >
                  Generate Nonce
                </Button>
                {nonce && <Typography>{nonce}</Typography>}
              </Stack>
              <Button
                sx={{
                  mt: "24px",
                }}
                disabled={!nonce}
                variant="contained"
                onClick={() => {
                  const params = new URLSearchParams({
                    client_id: CLIENT_ID,
                    redirect_uri: REDIRECT_URI,
                    response_type: "id_token",
                    scope: "openid",
                    nonce: nonce,
                  });
                  const loginURL = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
                  window.location.replace(loginURL);
                }}
              >
                <img
                  src={GoogleLogo}
                  width="16px"
                  style={{
                    marginRight: "8px",
                  }}
                  alt="Google"
                />{" "}
                Sign In With Google
              </Button>
            </Box>
          </Stack>
        }
      </div>

      {activeStep === 1 && (
        <div>
          <Box
            sx={{
              mt: "24px",
              p: "50px",
            }}
            className="border border-slate-300 rounded-xl"
          >
            {/* Step 3 */}
            {
              <Box>
                <Typography
                  sx={{
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    mb: "12px !important",
                  }}
                >
                  Decode JWT
                </Typography>
                {decodedJwt && (
                  <Alert
                    variant="standard"
                    color="success"
                    sx={{
                      fontWeight: 600,
                    }}
                  >
                    Successfully logged in via Google!
                  </Alert>
                )}
                <SyntaxHighlighter
                  wrapLongLines
                  wrapLines
                  language="typescript"
                >
                  {`// id_token Header.Payload.Signature
${JSON.stringify(jwtString)}`}
                </SyntaxHighlighter>
                <SyntaxHighlighter wrapLongLines language="json">
                  {JSON.stringify(decodedJwt, null, 2) !== undefined
                    ? `// JWT Payload
${JSON.stringify(decodedJwt, null, 2)}`
                    : "Not Available"}
                </SyntaxHighlighter>
                <Stack
                  spacing={1}
                  sx={{
                    m: "24px 0",
                  }}
                >
                  <Typography>
                    <code>iss (issuer)</code>：<b>Issuer</b>
                  </Typography>
                  <Typography>
                    <code>aud (audience)</code>：<b>JWT Consumer (CLIENT_ID)</b>
                  </Typography>
                  <Typography>
                    <code>sub (subject)</code>：
                    <b>Subject (user identifier, unique for each user)</b>
                  </Typography>
                  <Typography>
                    <code>nonce</code>：Signature order (values generated by
                    assembling URL parameters earlier)
                  </Typography>
                  <Typography>
                    <code>nbf (Not Before)</code>：Issued At
                  </Typography>
                  <Typography>
                    <code>iat(Issued At)</code>：Issued Time
                  </Typography>
                  <Typography>
                    <code>exp (expiration time)</code>：Expiration Time
                  </Typography>
                  <Typography>
                    <code>jti (JWT ID)</code>：JWT ID
                  </Typography>
                </Stack>
              </Box>
            }
            {/* Step 4 */}
            {
              <Stack spacing={2}>
                <Typography
                  sx={{
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    mb: "12px !important",
                  }}
                >
                  Generate User's Salt
                </Typography>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  sx={{
                    mt: "12px!important",
                  }}
                >
                  <Button
                    variant="contained"
                    disabled={Boolean(userSalt)}
                    onClick={() => {
                      const salt = generateRandomness();
                      window.localStorage.setItem(
                        USER_SALT_LOCAL_STORAGE_KEY,
                        salt
                      );
                      setUserSalt(salt);
                    }}
                  >
                    Generate User Salt
                  </Button>
                  <Button
                    variant="contained"
                    disabled={!userSalt}
                    color="error"
                    onClick={() => {
                      const salt = generateRandomness();
                      setUserSalt(salt);
                      window.localStorage.removeItem(
                        USER_SALT_LOCAL_STORAGE_KEY
                      );
                      setUserSalt(undefined);
                    }}
                  >
                    Delete User Salt
                  </Button>
                </Stack>
                <Typography>
                  User Salt: {userSalt && <code>{userSalt}</code>}
                </Typography>
              </Stack>
            }
            {/* Step 5 */}
            {
              <Stack spacing={2}>
                <Typography
                  sx={{
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    mb: "12px !important",
                  }}
                >
                  Generate User's Sui Address
                </Typography>
                <Box>
                  <Button
                    variant="contained"
                    disabled={
                      !userSalt || !jwtString || Boolean(zkLoginUserAddress)
                    }
                    onClick={() => {
                      if (!userSalt) {
                        return;
                      }
                      console.log("jwtString ::: ", jwtString);
                      const zkLoginUserAddress = jwtToAddress(
                        jwtString,
                        userSalt
                      );
                      console.log(
                        "zkLoginUserAddress ::: ",
                        zkLoginUserAddress
                      );
                      setZkLoginUserAddress(zkLoginUserAddress);
                    }}
                  >
                    Generate Hydro Address
                  </Button>
                </Box>
                <Typography
                  sx={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  User Hydro Address:{" "}
                  {zkLoginUserAddress && (
                    <code>
                      <Typography
                        component="span"
                        sx={{
                          fontFamily: "'Noto Sans Mono', monospace;",
                          fontWeight: 600,
                        }}
                      >
                        {zkLoginUserAddress}
                      </Typography>
                    </code>
                  )}
                  <LoadingButton
                    variant="contained"
                    sx={{
                      ml: "24px",
                    }}
                    size="small"
                    loading={requestingFaucet}
                    disabled={!zkLoginUserAddress}
                    onClick={requestFaucet}
                  >
                    Request Test Hydro Token
                  </LoadingButton>
                </Typography>
                {zkLoginUserAddress && (
                  <Alert severity="success">
                    Congratulations! At this stage, your Hydro zkLogin address
                    has been successfully generated.
                  </Alert>
                )}
              </Stack>
            }
            {/* Step 6 */}
            {
              <Stack spacing={2}>
                <Typography
                  sx={{
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    mb: "12px !important",
                  }}
                >
                  Fetch ZK Proof (Groth16)
                </Typography>
                <Box>
                  <Button
                    variant="contained"
                    onClick={() => {
                      if (!ephemeralKeyPair) {
                        return;
                      }
                      const extendedEphemeralPublicKey =
                        getExtendedEphemeralPublicKey(
                          ephemeralKeyPair.getPublicKey()
                        );

                      setExtendedEphemeralPublicKey(extendedEphemeralPublicKey);
                    }}
                  >
                    Generate the extended ephemeral public key
                  </Button>
                  <Typography
                    sx={{
                      mt: "12px",
                    }}
                  >
                    extendedEphemeralPublicKey:
                    {extendedEphemeralPublicKey && (
                      <code>{extendedEphemeralPublicKey}</code>
                    )}
                  </Typography>
                </Box>
                <LoadingButton
                  loading={fetchingZKProof}
                  variant="contained"
                  disabled={
                    !oauthParams?.id_token ||
                    !extendedEphemeralPublicKey ||
                    !maxEpoch ||
                    !randomness ||
                    !userSalt
                  }
                  onClick={async () => {
                    try {
                      setFetchingZKProof(true);
                      const zkProofResult = await axios.post(
                        SUI_PROVER_DEV_ENDPOINT,
                        {
                          jwt: oauthParams?.id_token as string,
                          extendedEphemeralPublicKey:
                            extendedEphemeralPublicKey,
                          maxEpoch: maxEpoch,
                          jwtRandomness: randomness,
                          salt: userSalt,
                          keyClaimName: "sub",
                        },
                        {
                          headers: {
                            "Content-Type": "application/json",
                          },
                        }
                      );
                      setZkProof(zkProofResult.data as PartialZkLoginSignature);
                      enqueueSnackbar("Successfully obtain ZK Proof", {
                        variant: "success",
                      });
                    } catch (error: any) {
                      console.error(error);
                      enqueueSnackbar(
                        String(error?.response?.data?.message || error),
                        {
                          variant: "error",
                        }
                      );
                    } finally {
                      setFetchingZKProof(false);
                    }
                  }}
                >
                  Fetch ZK Proof
                </LoadingButton>
                {zkProof && (
                  <SyntaxHighlighter
                    wrapLongLines
                    language="typescript"
                    // style={oneDark}
                  >
                    {JSON.stringify(zkProof, null, 2)}
                  </SyntaxHighlighter>
                )}
              </Stack>
            }
            {/* Step 7 */}
            {
              <Box>
                <Typography
                  sx={{
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    mb: "12px !important",
                  }}
                >
                  Assemble zkLogin signature and submit the transaction
                </Typography>
                <div className="card">
                  <LoadingButton
                    loading={executingTxn}
                    variant="contained"
                    disabled={!decodedJwt}
                    onClick={async () => {
                      try {
                        if (
                          !ephemeralKeyPair ||
                          !zkProof ||
                          !decodedJwt ||
                          !userSalt
                        ) {
                          return;
                        }
                        setExecutingTxn(true);
                        const txb = new TransactionBlock();

                        const [coin] = txb.splitCoins(txb.gas, [
                          MIST_PER_SUI * BigInt(1),
                        ]);
                        txb.transferObjects(
                          [coin],
                          "0xfa0f8542f256e669694624aa3ee7bfbde5af54641646a3a05924cf9e329a8a36"
                        );
                        txb.setSender(zkLoginUserAddress);

                        const { bytes, signature: userSignature } =
                          await txb.sign({
                            client: suiClient,
                            signer: ephemeralKeyPair, // This must be the same ephemeral key pair used in the ZKP request
                          });
                        if (!decodedJwt?.sub || !decodedJwt.aud) {
                          return;
                        }

                        const addressSeed: string = genAddressSeed(
                          BigInt(userSalt),
                          "sub",
                          decodedJwt.sub,
                          decodedJwt.aud as string
                        ).toString();

                        const zkLoginSignature: SerializedSignature =
                          getZkLoginSignature({
                            inputs: {
                              ...zkProof,
                              addressSeed,
                            },
                            maxEpoch,
                            userSignature,
                          });

                        const executeRes =
                          await suiClient.executeTransactionBlock({
                            transactionBlock: bytes,
                            signature: zkLoginSignature,
                          });

                        enqueueSnackbar(
                          `Execution successful: ${executeRes.digest}`,
                          {
                            variant: "success",
                          }
                        );
                        setExecuteDigest(executeRes.digest);
                      } catch (error) {
                        console.error(error);
                        enqueueSnackbar(String(error), {
                          variant: "error",
                        });
                      } finally {
                        setExecutingTxn(false);
                      }
                    }}
                  >
                    Execute Transaction Block
                  </LoadingButton>
                  {executeDigest && (
                    <Alert severity="success" sx={{ mt: "12px" }}>
                      Execution successful:{" "}
                      <Typography
                        component="span"
                        sx={{
                          fontFamily: "'Noto Sans Mono', monospace;",
                          fontWeight: 600,
                        }}
                      >
                        <a
                          href={`https://suiexplorer.com/txblock/${executeDigest}?network=devnet`}
                          target="_blank"
                        >
                          {executeDigest}
                        </a>
                      </Typography>
                    </Alert>
                  )}
                </div>
              </Box>
            }
          </Box>
        </div>
      )}
    </Box>
  );
}

export default AuthComponent;
