"use client";

import React from "react";
import { useStytch, useStytchSession, useStytchUser } from "@stytch/nextjs";
import { AuthMethodType, ProviderType } from '@lit-protocol/constants';
import cookieCutter from 'cookie-cutter'
import { StytchOtpProvider } from "@lit-protocol/lit-auth-client";
import * as LitJsSdk from "@lit-protocol/lit-node-client";
import { LitPKPResource, LitAbility } from '@lit-protocol/auth-helpers';

/**
 * The Profile component is shown to a user that is logged in.
 * 
 * This component renders the full User and Session object for education. 
 * 
 * This component also includes a log out button which is accomplished by making a method call to revoking the existing session
*/
const Profile = () => {
  const stytch = useStytch();
  // Get the Stytch User object if available
  const { user } = useStytchUser();
  // Get the Stytch Session object if available
  const { session } = useStytchSession();

  const mintPkp = async () => {
    // create the auth method
    const authMethod = {
      authMethodType: AuthMethodType.StytchOtp,
      accessToken: cookieCutter.get('stytch_session_jwt')
    }
    console.log(`authMethod: ${JSON.stringify(authMethod)}`)

    // derive the auth method id
    const authMethodId = await StytchOtpProvider.authMethodId(authMethod)

    // mint the PKP in the relayer
    const relayerBody = {
      keyType: '2',
      permittedAuthMethodTypes: [authMethod.authMethodType],
      permittedAuthMethodIds: [authMethodId],
      permittedAuthMethodPubkeys: ["0x"],
      permittedAuthMethodScopes: [["1"]],
      addPkpEthAddressAsPermittedAddress: false,
      sendPkpToItself: true,
    }
    const url = "https://relayer-server-staging-cayenne.getlit.dev/mint-next-and-add-auth-methods"
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': 'this_is_a_test'
      },
      body: JSON.stringify(relayerBody),
    });
    const data = await response.json()
    console.log(`mintPkp: ${JSON.stringify(data)}`)

    // poll the relayer for a successful mint
    const { requestId } = data;
    const pollingUrl = "https://relayer-server-staging-cayenne.getlit.dev/auth/status/" + requestId
    const pollingResponse = await fetch(pollingUrl, {
      method: 'GET',
      headers: {
        'api-key': 'this_is_a_test'
      }
    });
    const pollingData = await pollingResponse.json()
    console.log(`pollingData: ${JSON.stringify(pollingData)}`)
    // pollingData looks like this: {"status":"Succeeded","pkpTokenId":"0xfc234350477ccfbeb2c5950e39913a4a38ac26c17525ba175170728e0ec5aae1","pkpEthAddress":"0x2f80dd01Ee934Cc82595E6aC3f1f8D72D7df2585","pkpPublicKey":"0x0424644678b562c26f6c8b00c4350c98feb09cbaea5606156e5eab7b70167520451f530a188cc517cee0a2d10f7541ba3336dd80302557c48cce637ccea8c16aed"}
    const { status, pkpTokenId, pkpEthAddress, pkpPublicKey } = pollingData;


    // ok great, time to sign using this PKP
    const litNodeClient = new LitJsSdk.LitNodeClient({ litNetwork: 'cayenne' });
    await litNodeClient.connect();

    const litAuthClient = new LitAuthClient({
      litRelayConfig: {
         // Request a Lit Relay Server API key here: https://forms.gle/RNZYtGYTY9BcD9MEA
        relayApiKey: 'this_is_a_test',
      },
      litNodeClient
    });

    // Initialize Stytch provider
    const provider = litAuthClient.initProvider(ProviderType.StytchOtp);

    // Get session signatures for the given PKP public key and auth method
    // Create an access control condition resource
    const litResource = new LitPKPResource("*");
    const sessionSigs = await provider.getSessionSigs({
      authMethod,
      pkpPublicKey,
      sessionSigsParams: {
        chain: 'ethereum',
        resourceAbilityRequests: [{
            resource: litResource,
            ability: LitAbility.PKPSigning,
          }
        ],
      },
    });
    console.log('session sigs: ', sessionSigs);

    // Get a signature
    const signatures = await litNodeClient.pkpSign({
      sessionSigs,
        toSign: [84, 104, 105, 115, 32, 109, 101, 115, 115, 97, 103, 101, 32, 105, 115, 32, 101, 120, 97, 99, 116, 108, 121, 32, 51, 50, 32, 98, 121, 116, 101, 115],
        pubKey: pkpPublicKey,
    });
    
    console.log("signatures: ", signatures);


  };

  return (
    <div className="card">
      <h1>Profile</h1>
      <h2>User object</h2>
      <pre className="code-block">
        <code>{JSON.stringify(user, null, 2)}</code>
      </pre>

      <h2>Session object</h2>
      <pre className="code-block">
        <code>{JSON.stringify(session, null, 2)}</code>
      </pre>
      <p>
        You are logged in, and a Session has been created. The SDK stores the
        Session as a token and a JWT in the browser cookies as{" "}
        <span className="code">stytch_session</span> and{" "}
        <span className="code">stytch_session_jwt</span> respectively.
      </p>
      <button className="primary" onClick={mintPkp}>Mint PKP and Sign Something</button>
      <br/>
      <br/>
      {/* Revoking the session results in the session being revoked and cleared from browser storage. The user will return to Login.js */}
      <button onClick={() => stytch.session.revoke()}>
        Log out
      </button>
    </div>
  );
};

export default Profile;
